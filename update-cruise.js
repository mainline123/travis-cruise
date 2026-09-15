const fs = require("fs");

const APIFY_TOKEN = process.env.APIFY_TOKEN;
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
    { name: "Ocho Rios", matches: ["ocho rios"] },
    { name: "Montego Bay", matches: ["montego bay"] },
    { name: "Falmouth", matches: ["falmouth"] },
    { name: "Kingston", matches: ["kingston"] },
    { name: "Port Antonio", matches: ["port antonio"] }
];

function identifyJamaicaPort(port) {
    const portName = String(
        port?.portName ||
        port?.name ||
        ""
    ).toLowerCase().trim();

    for (const jamaicaPort of JAMAICA_PORTS) {
        if (
            jamaicaPort.matches.some(match =>
                portName.includes(match)
            )
        ) {
            return jamaicaPort.name;
        }
    }

    return null;
}

// ============================================================
// DATE HANDLING
// ============================================================

const MONTHS = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
};

/*
CruiseMapper may return:

23 Sep 08:00 - 16:00

We need:

2026-09-23
*/

function normalizeDate(value) {
    if (!value) {
        return "";
    }

    const text = String(value).trim();

    // Already correct
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text;
    }

    // Look for:
    // 23 Sep
    // 23 September
    const match = text.match(
        /(\d{1,2})\s+([A-Za-z]{3,9})/i
    );

    if (match) {
        const day = String(
            parseInt(match[1], 10)
        ).padStart(2, "0");

        const monthText =
            match[2]
                .substring(0, 3)
                .toLowerCase();

        const month =
            MONTHS[monthText];

        if (month) {
            /*
            Determine year.

            Cruise schedules may cross New Year.
            If the cruise month is far behind the
            current month, treat it as next year.
            */

            const now = new Date();

            const jamaicaNow = new Date(
                now.getTime() -
                (5 * 60 * 60 * 1000)
            );

            let year =
                jamaicaNow.getUTCFullYear();

            const currentMonth =
                jamaicaNow.getUTCMonth() + 1;

            const cruiseMonth =
                parseInt(month, 10);

            // Example:
            // December current date + January cruise
            // means January of next year.
            if (
                cruiseMonth <
                currentMonth - 6
            ) {
                year += 1;
            }

            return `${year}-${month}-${day}`;
        }
    }

    // Last attempt for other date formats
    const parsed = new Date(text);

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

    console.warn(
        `Could not normalize date: ${text}`
    );

    return "";
}

// ============================================================
// TIME HANDLING
// ============================================================

function normalizeTime(value) {
    if (!value) {
        return "--:--";
    }

    const text =
        String(value).trim();

    // Find HH:MM anywhere in the value
    const match =
        text.match(
            /(\d{1,2}):(\d{2})/
        );

    if (match) {
        return (
            `${String(
                parseInt(match[1], 10)
            ).padStart(2, "0")}:` +
            `${match[2]}`
        );
    }

    return "--:--";
}

function extractDepartureTime(port) {
    const direct =
        port.departureTime ||
        port.departTime ||
        port.departure ||
        port.timeOut;

    if (direct) {
        return normalizeTime(direct);
    }

    /*
    CruiseMapper may put both times into:

    23 Sep 08:00 - 16:00
    */

    const combined = String(
        port.date ||
        port.arrivalDate ||
        port.portDate ||
        ""
    );

    const match =
        combined.match(
            /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
        );

    if (match) {
        return normalizeTime(match[2]);
    }

    return "--:--";
}

function extractArrivalTime(port) {
    const direct =
        port.arrivalTime ||
        port.arriveTime ||
        port.arrival ||
        port.timeIn;

    if (direct) {
        return normalizeTime(direct);
    }

    const combined = String(
        port.date ||
        port.arrivalDate ||
        port.portDate ||
        ""
    );

    const match =
        combined.match(
            /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
        );

    if (match) {
        return normalizeTime(match[1]);
    }

    return "--:--";
}

// ============================================================
// CONVERT TO DASHBOARD FORMAT
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

            const rawDate =
                port.date ||
                port.arrivalDate ||
                port.arriveDate ||
                port.portDate ||
                port.day ||
                "";

            const date =
                normalizeDate(rawDate);

            const arrivalTime =
                extractArrivalTime(port);

            const departureTime =
                extractDepartureTime(port);

            if (!date) {
                console.warn(
                    `Skipping ${shipName} at ${jamaicaPortName}: bad date "${rawDate}"`
                );
                continue;
            }

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
                `JAMAICA: ${date} | ` +
                `${jamaicaPortName} | ` +
                `${shipName} | ` +
                `${arrivalTime}-${departureTime}`
            );
        }
    }

    // Remove duplicates
    for (const portRecord of portMap.values()) {
        const seen = new Set();

        portRecord.upcomingArrivals =
            portRecord.upcomingArrivals.filter(
                arrival => {
                    const key = [
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
// MAIN
// ============================================================

async function main() {
    console.log(
        "Jamaica CruiseMapper updater starting..."
    );

    console.log(
        new Date().toISOString()
    );

    // Start ONE Apify run
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

    jamaicaData.forEach(port => {
        console.log(
            `${port.name}: ` +
            `${port.upcomingArrivals.length}`
        );
    });

    // Never overwrite working data
    // if the scraper unexpectedly returns nothing.
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
        "cruise-data.json updated successfully."
    );
}

main().catch(error => {
    console.error(
        "CRUISE UPDATE FAILED:"
    );

    console.error(error);

    process.exit(1);
});
