const fs = require("fs");

const SCHEDULE_URL =
    "https://portcharlottetown.com/cruise-schedule/";

const OUTPUT_FILE = "cruise-data.json";

/*
============================================================
CLEAN TEXT
============================================================
*/

function cleanText(value) {
    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#038;/gi, "&")
        .replace(/&#8211;|&#8212;/gi, "-")
        .replace(/&#(\d+);/g, (_, n) =>
            String.fromCharCode(Number(n))
        )
        .replace(/\s+/g, " ")
        .trim();
}

/*
============================================================
DATE
============================================================
*/

function normalizeDate(value) {

    const text = cleanText(value);

    const months = {
        jan: "01",
        january: "01",
        feb: "02",
        february: "02",
        mar: "03",
        march: "03",
        apr: "04",
        april: "04",
        may: "05",
        jun: "06",
        june: "06",
        jul: "07",
        july: "07",
        aug: "08",
        august: "08",
        sep: "09",
        sept: "09",
        september: "09",
        oct: "10",
        october: "10",
        nov: "11",
        november: "11",
        dec: "12",
        december: "12"
    };

    /*
       Port Charlottetown:
       Oct 20, 2026 8:00 am
    */

    const match = text.match(
        /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/i
    );

    if (!match) {
        return "";
    }

    const month =
        months[
            match[1].toLowerCase()
        ];

    if (!month) {
        return "";
    }

    const day =
        String(
            Number(match[2])
        ).padStart(2, "0");

    return `${match[3]}-${month}-${day}`;
}

/*
============================================================
TIME
============================================================
*/

function normalizeTime(value) {

    const text = cleanText(value);

    const match =
        text.match(
            /(\d{1,2}):(\d{2})\s*(am|pm)/i
        );

    if (!match) {
        return "--:--";
    }

    let hour =
        Number(match[1]);

    const minute =
        match[2];

    const period =
        match[3].toLowerCase();

    if (
        period === "pm" &&
        hour !== 12
    ) {
        hour += 12;
    }

    if (
        period === "am" &&
        hour === 12
    ) {
        hour = 0;
    }

    return (
        String(hour).padStart(2, "0") +
        ":" +
        minute
    );
}

/*
============================================================
NUMBER
============================================================
*/

function extractNumber(value) {

    const text =
        cleanText(value);

    const match =
        text.match(/[\d,]+/);

    if (!match) {
        return 0;
    }

    return Number(
        match[0].replace(/,/g, "")
    ) || 0;
}

/*
============================================================
EXTRACT HTML TABLE ROWS
============================================================
*/

function extractRows(html) {

    const rows = [];

    const rowRegex =
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;

    while (
        (rowMatch = rowRegex.exec(html))
        !== null
    ) {

        const rowHtml =
            rowMatch[1];

        const cells = [];

        const cellRegex =
            /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

        let cellMatch;

        while (
            (cellMatch =
                cellRegex.exec(rowHtml))
            !== null
        ) {

            cells.push(
                cleanText(
                    cellMatch[1]
                )
            );
        }

        if (cells.length) {
            rows.push(cells);
        }
    }

    return rows;
}

/*
============================================================
REMOVE LABEL CELLS

The first Port Charlottetown row can contain:

Oct 20, 2026 8:00 am
Arrival
Oct 20, 2026 4:00 pm
Departure
Silver Shadow
Ship
Silversea
Cruise Line
392
Passengers
302
Crew
On Time
Status

We remove the label cells so it becomes the same
7-column structure as all the following rows.
============================================================
*/

function removeLabelCells(cells) {

    const labels = new Set([
        "arrival",
        "departure",
        "ship",
        "vessel",
        "cruise line",
        "passengers",
        "passenger",
        "guests",
        "guest",
        "crew",
        "status"
    ]);

    return cells.filter(cell => {

        const value =
            cleanText(cell)
                .toLowerCase();

        return !labels.has(value);
    });
}

/*
============================================================
BUILD CHARLOTTETOWN DATA
============================================================
*/

function buildDataset(rows) {

    const arrivals = [];

    for (const originalRow of rows) {

        const cells =
            removeLabelCells(
                originalRow
            );

        /*
           Expected after labels removed:

           0 Arrival date/time
           1 Departure date/time
           2 Ship
           3 Cruise Line
           4 Passengers
           5 Crew
           6 Status
        */

        if (cells.length < 7) {
            continue;
        }

        const arrivalRaw =
            cells[0];

        const departureRaw =
            cells[1];

        const shipName =
            cleanText(
                cells[2]
            );

        const cruiseLine =
            cleanText(
                cells[3]
            );

        const passengers =
            extractNumber(
                cells[4]
            );

        const crew =
            extractNumber(
                cells[5]
            );

        const status =
            cleanText(
                cells[6]
            );

        const date =
            normalizeDate(
                arrivalRaw
            );

        if (!date) {

            console.log(
                "Ignoring non-cruise row:",
                cells
            );

            continue;
        }

        if (!shipName) {
            continue;
        }

        const arrivalTime =
            normalizeTime(
                arrivalRaw
            );

        const departureTime =
            normalizeTime(
                departureRaw
            );

        arrivals.push({
            shipName,
            date,
            arrivalTime,
            departureTime,
            passengers,
            crew,
            cruiseLine,
            status
        });

        console.log(
            `FOUND: ${date} | ` +
            `${shipName} | ` +
            `${arrivalTime}-${departureTime} | ` +
            `${passengers} passengers | ` +
            `${crew} crew | ` +
            `${status}`
        );
    }

    /*
    ========================================================
    REMOVE DUPLICATES
    ========================================================
    */

    const unique = [];

    const seen =
        new Set();

    for (const arrival of arrivals) {

        const key = [
            arrival.shipName,
            arrival.date,
            arrival.arrivalTime,
            arrival.departureTime
        ].join("|");

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);

        unique.push(arrival);
    }

    /*
    ========================================================
    SORT
    ========================================================
    */

    unique.sort(
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

    return [
        {
            recordType: "port",
            name: "Charlottetown",
            upcomingArrivals:
                unique,
            scrapedAt:
                new Date().toISOString()
        }
    ];
}

/*
============================================================
MAIN
============================================================
*/

async function main() {

    console.log(
        "Port Charlottetown cruise updater starting..."
    );

    console.log(
        new Date().toISOString()
    );

    console.log(
        `Downloading ${SCHEDULE_URL}`
    );

    const response =
        await fetch(
            SCHEDULE_URL,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (compatible; VMM Cruise Display/1.0)",

                    "Accept":
                        "text/html,application/xhtml+xml"
                }
            }
        );

    if (!response.ok) {

        throw new Error(
            `Port Charlottetown returned HTTP ${response.status}`
        );
    }

    const html =
        await response.text();

    console.log(
        `Downloaded ${html.length} characters.`
    );

    const rows =
        extractRows(html);

    console.log(
        `Found ${rows.length} HTML table rows.`
    );

    const data =
        buildDataset(rows);

    const total =
        data[0]
            .upcomingArrivals
            .length;

    console.log(
        `Charlottetown cruise calls found: ${total}`
    );

    /*
    ========================================================
    SAFETY

    Never replace the existing JSON with an empty file
    if Port Charlottetown changes its website.
    ========================================================
    */

    if (total === 0) {

        throw new Error(
            "No Charlottetown cruise calls were found. Existing cruise-data.json was NOT overwritten."
        );
    }

    /*
    ========================================================
    WRITE JSON
    ========================================================
    */

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            data,
            null,
            2
        )
    );

    console.log(
        "cruise-data.json updated successfully."
    );

    console.log(
        `${total} Charlottetown cruise calls saved.`
    );
}

/*
============================================================
RUN
============================================================
*/

main().catch(error => {

    console.error(
        "CRUISE UPDATE FAILED:"
    );

    console.error(error);

    process.exit(1);
});
