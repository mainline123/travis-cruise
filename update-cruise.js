const fs = require("fs");

const APIFY_TOKEN = process.env.APIFY_TOKEN;

// Existing CruiseMapper Scraper Actor used by this dashboard
const ACTOR_ID = "QkfiudQbVbhHCif5r";

if (!APIFY_TOKEN) {
    console.error("ERROR: APIFY_TOKEN GitHub secret is missing.");
    process.exit(1);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("CruiseMapper backup updater starting...");
    console.log(new Date().toISOString());

    // Start one new scraper run
    const startUrl =
        `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`;

    const startResponse = await fetch(startUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    });

    if (!startResponse.ok) {
        throw new Error(
            `Could not start CruiseMapper Actor: HTTP ${startResponse.status}`
        );
    }

    const startResult = await startResponse.json();

    const runId = startResult?.data?.id;

    if (!runId) {
        throw new Error("Apify did not return a run ID.");
    }

    console.log(`Started Apify run: ${runId}`);

    // Wait for the scraper to finish
    let run;

    for (let attempt = 1; attempt <= 30; attempt++) {
        await sleep(5000);

        const statusResponse = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );

        if (!statusResponse.ok) {
            throw new Error(
                `Could not check Apify run: HTTP ${statusResponse.status}`
            );
        }

        const statusResult = await statusResponse.json();
        run = statusResult.data;

        console.log(`Run status: ${run.status}`);

        if (run.status === "SUCCEEDED") {
            break;
        }

        if (
            run.status === "FAILED" ||
            run.status === "ABORTED" ||
            run.status === "TIMED-OUT"
        ) {
            throw new Error(`CruiseMapper Actor ended with status ${run.status}`);
        }
    }

    if (!run || run.status !== "SUCCEEDED") {
        throw new Error("CruiseMapper Actor did not finish in time.");
    }

    const datasetId = run.defaultDatasetId;

    if (!datasetId) {
        throw new Error("Completed run did not provide a dataset ID.");
    }

    // Download the results produced by THIS run
    const dataResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${APIFY_TOKEN}`
    );

    if (!dataResponse.ok) {
        throw new Error(
            `Could not download cruise dataset: HTTP ${dataResponse.status}`
        );
    }

    const cruiseData = await dataResponse.json();

    if (!Array.isArray(cruiseData)) {
        throw new Error("CruiseMapper returned an unexpected dataset.");
    }

    console.log(`CruiseMapper returned ${cruiseData.length} records.`);

    // Save a public JSON copy for the dashboard.
    // The API token itself is NEVER written to this file.
    fs.writeFileSync(
        "cruise-data.json",
        JSON.stringify(cruiseData, null, 2)
    );

    console.log("cruise-data.json updated successfully.");
}

main().catch(error => {
    console.error("CRUISE UPDATE FAILED:");
    console.error(error);
    process.exit(1);
});
