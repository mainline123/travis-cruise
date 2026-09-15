const fs = require("fs");

const APIFY_TOKEN = process.env.APIFY_TOKEN;

// Existing CruiseMapper Scraper Actor
const ACTOR_ID = "QkfiudQbVbhHCif5r";

if (!APIFY_TOKEN) {
    console.error("ERROR: APIFY_TOKEN GitHub secret is missing.");
    process.exit(1);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// JAMAICA PORTS
// ============================================================

const JAMAICA_PORTS = [
    {
        name: "Ocho Rios",
        matches: [
            "ocho rios"
        ]
    },
    {
        name: "Montego Bay",
        matches: [
            "montego bay"
        ]
    },
    {
        name: "Falmouth",
        matches: [
            "falmouth"
        ]
    },
    {
        name: "Kingston",
        matches: [
            "kingston"
        ]
    },
    {
        name: "Port Antonio",
        matches: [
            "port antonio"
        ]
    }
];

function identifyJamaicaPort(port) {

    const portName =
        String(
            port?.portName ||
            port?.name ||
            ""
        )
        .toLowerCase()
        .trim();

    const country =
        String(
            port?.country ||
            ""
        )
        .toLowerCase()
        .trim();

    // First check the port name.
    for (const jamaicaPort of JAMAICA_PORTS) {

        const matched =
            jamaicaPort.matches.some(
                match =>
                    portName.includes(match)
            );

        if (matched) {
            return jamaicaPort.name;
        }
    }

    // If CruiseMapper explicitly identifies Jamaica,
    // keep checking known Jamaican port names.
    if (
        country === "jamaica" ||
        country.includes("jamaica")
    ) {

        for (const jamaicaPort of JAMAICA_PORTS) {

            const matched =
                jamaicaPort.matches.some(
                    match =>
                        portName.includes(match)
                );

            if (matched) {
                return jamaicaPort.name;
            }
        }
    }

    return null;
}

// ============================================================
// NORMALIZE DATES
// ============================================================

function normalizeDate(value) {

    if (!value) {
        return "";
    }

    const text =
        String(value).trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text;
    }

    const parsed =
        new Date(text);

    if (!Number.isNaN(parsed.getTime())) {

        const year =
            parsed.getUTCFullYear();

        const month =
            String(
                parsed.getUTCMonth() + 1
            ).padStart(2, "0");

        const day =
            String(
                parsed.getUTCDate()
            ).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    return text;
}

// ============================================================
// NORMALIZE TIME
// ============================================================

function normalizeTime(value) {

    if (!value) {
        return "--:--";
    }

    const text =
        String(value).trim();

    // HH:MM
    const match24 =
        text.match(
            /^(\d{1,2}):(\d{2})$/
        );

    if (match24) {

        return (
            `${String(match24[1]).padStart(2, "0")}:` +
            `${match24[2]}`
        );
    }

    // 12-hour time such as 8:00 AM
    const match12 =
        text.match(
            /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
        );

    if (match12) {

        let hour =
            parseInt(
                match12[1],
                10
            );

        const minute =
            match12[2];

        const ampm =
            match12[3]
                .toUpperCase();

        if (
            ampm === "PM" &&
            hour < 12
        ) {
            hour += 12;
        }

        if (
            ampm === "AM" &&
            hour === 12
        ) {
            hour = 0;
        }

        return (
            `${String(hour).padStart(2, "0")}:` +
            `${minute}`
        );
    }

    return text;
}

// ============================================================
// CONVERT CRUISEMAPPER DATA INTO DASHBOARD FORMAT
// ============================================================

function buildJamaicaDataset(rawData) {

    const portMap = new Map();

    for (const jamaicaPort of JAMAICA_PORTS) {

        portMap.set(
            jamaicaPort.name,
            {
                recordType: "port",
                name: jamaicaPort.name,
                upcomingArrivals: [],
                scrapedAt:
                    new Date().toISOString()
            }
        );
    }

    for (const cruise of rawData) {

        const shipName =
            cruise.shipName ||
            cruise.ship ||
            cruise.name ||
            cruise.vesselName ||
            "Unknown Ship";

        const ports =
            cruise.ports ||
            cruise.itinerary ||
            cruise.portCalls ||
            cruise.schedule ||
            [];

        if (!Array.isArray(ports)) {
            continue;
        }

        for (const port of ports) {

            const jamaicaPortName =
                identifyJamaicaPort(port);

            if (!jamaicaPortName) {
                continue;
            }

            const date =
                normalizeDate(
                    port.date ||
                    port.arrivalDate ||
                    port.arriveDate ||
                    port.portDate ||
                    port.day
                );

            const arrivalTime =
                normalizeTime(
                    port.arrivalTime ||
                    port.arriveTime ||
                    port.arrival ||
                    port.timeIn
                );

            const departureTime =
                normalizeTime(
                    port.departureTime ||
                    port.departTime ||
                    port.departure ||
                    port.timeOut
                );

            const portRecord =
                portMap.get(
                    jamaicaPortName
                );

            portRecord.upcomingArrivals.push({
                shipName,
                date,
                arrivalTime,
                departureTime
            });

            console.log(
                `JAMAICA: ${date} | ${jamaicaPortName} | ${shipName} | ${arrivalTime}-${departureTime}`
            );
        }
    }

    // Remove duplicate port calls.
    for (const portRecord of portMap.values()) {

        const seen =
            new Set();

        portRecord.upcomingArrivals =
            portRecord.upcomingArrivals.filter(
                arrival => {

                    const key =
                        [
                            arrival.shipName,
                            arrival.date,
                            arrival.arrivalTime,
                            arrival.departureTime
                        ].join("|");

                    if (seen.has(key)) {
                        return false;
                    }

                    seen.add(key);
                    return true;
                }
            );

        portRecord.upcomingArrivals.sort(
            (a, b) => {

                if (a.date !== b.date) {
                    return a.date.localeCompare(
                        b.date
                    );
                }

                return a.arrivalTime.localeCompare(
                    b.arrivalTime
                );
            }
        );
    }

    return Array.from(
        portMap.values()
    );
}

// ============================================================
// MAIN UPDATE
// ============================================================

async function main() {

    console.log(
        "Jamaica CruiseMapper updater starting..."
    );

    console.log(
        new Date().toISOString()
    );

    // Start ONE paid CruiseMapper run.
    const startResponse =
        await fetch(
            `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );

    if (!startResponse.ok) {

        throw new Error(
            `Could not start CruiseMapper Actor: HTTP ${startResponse.status}`
        );
    }

    const startResult =
        await startResponse.json();

    const runId =
        startResult?.data?.id;

    if (!runId) {
        throw new Error(
            "Apify did not return a run ID."
        );
    }

    console.log(
        `Started Apify run: ${runId}`
    );

    // Wait for scraper to finish.
    let run = null;

    for (
        let attempt = 1;
        attempt <= 40;
        attempt++
    ) {

        await sleep(5000);

        const statusResponse =
            await fetch(
                `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
            );

        if (!statusResponse.ok) {

            throw new Error(
                `Could not check Apify run: HTTP ${statusResponse.status}`
            );
        }

        const statusResult =
            await statusResponse.json();

        run =
            statusResult.data;

        console.log(
            `Run status: ${run.status}`
        );

        if (
            run.status ===
            "SUCCEEDED"
        ) {
            break;
        }

        if (
            run.status === "FAILED" ||
            run.status === "ABORTED" ||
            run.status === "TIMED-OUT"
        ) {

            throw new Error(
                `CruiseMapper Actor ended with status ${run.status}`
            );
        }
    }

    if (
        !run ||
        run.status !== "SUCCEEDED"
    ) {

        throw new Error(
            "CruiseMapper Actor did not finish in time."
        );
    }

    const datasetId =
        run.defaultDatasetId;

    if (!datasetId) {

        throw new Error(
            "Completed run did not provide a dataset ID."
        );
    }

    // Download THIS run's results.
    const dataResponse =
        await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${APIFY_TOKEN}`
        );

    if (!dataResponse.ok) {

        throw new Error(
            `Could not download CruiseMapper dataset: HTTP ${dataResponse.status}`
        );
    }

    const rawData =
        await dataResponse.json();

    if (!Array.isArray(rawData)) {

        throw new Error(
            "CruiseMapper returned an unexpected dataset."
        );
    }

    console.log(
        `CruiseMapper returned ${rawData.length} raw records.`
    );

    // Convert to Jamaica-only port records.
    const jamaicaData =
        buildJamaicaDataset(
            rawData
        );

    const totalJamaicaCalls =
        jamaicaData.reduce(
            (total, port) =>
                total +
                port.upcomingArrivals.length,
            0
        );

    console.log(
        `Jamaica cruise calls found: ${totalJamaicaCalls}`
    );

    jamaicaData.forEach(
        port => {

            console.log(
                `${port.name}: ${port.upcomingArrivals.length}`
            );
        }
    );

    // Safety check:
    // Do NOT overwrite working data with an empty file.
    if (totalJamaicaCalls === 0) {

        throw new Error(
            "No Jamaica cruise calls were found. Existing cruise-data.json was NOT overwritten."
        );
    }

    fs.writeFileSync(
        "cruise-data.json",
        JSON.stringify(
            jamaicaData,
            null,
            2
        )
    );

    console.log(
        "cruise-data.json updated with Jamaica-only cruise calls."
    );
}

main().catch(
    error => {

        console.error(
            "CRUISE UPDATE FAILED:"
        );

        console.error(
            error
        );

        process.exit(1);
    }
);
