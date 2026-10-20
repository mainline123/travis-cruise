const fs = require("fs");

const SCHEDULE_URL =
    "https://portcharlottetown.com/cruise-schedule/";

const OUTPUT_FILE = "cruise-data.json";

/*
============================================================
HELPERS
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

function monthNumber(month) {
    const months = {
        january: "01",
        february: "02",
        march: "03",
        april: "04",
        may: "05",
        june: "06",
        july: "07",
        august: "08",
        september: "09",
        october: "10",
        november: "11",
        december: "12"
    };

    return months[
        String(month).toLowerCase()
    ] || "";
}

function normalizeDate(value) {

    const text = cleanText(value);

    /*
       Examples supported:

       October 20, 2026
       Oct 20, 2026
       20 October 2026
    */

    let match = text.match(
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
    );

    if (match) {

        const month =
            monthNumber(match[1]);

        const day =
            String(
                Number(match[2])
            ).padStart(2, "0");

        return `${match[3]}-${month}-${day}`;
    }

    match = text.match(
        /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
    );

    if (match) {

        const month =
            monthNumber(match[2]);

        const day =
            String(
                Number(match[1])
            ).padStart(2, "0");

        return `${match[3]}-${month}-${day}`;
    }

    return "";
}

function normalizeTime(value) {

    const text =
        cleanText(value);

    /*
       08:00
       8:00 AM
       4:30 PM
    */

    let match =
        text.match(
            /(\d{1,2}):(\d{2})\s*(AM|PM)?/i
        );

    if (!match) {
        return "--:--";
    }

    let hour =
        Number(match[1]);

    const minute =
        match[2];

    const period =
        match[3]
            ? match[3].toUpperCase()
            : "";

    if (period === "PM" && hour < 12) {
        hour += 12;
    }

    if (period === "AM" && hour === 12) {
        hour = 0;
    }

    return (
        String(hour).padStart(2, "0") +
        ":" +
        minute
    );
}

function extractNumber(value) {

    const text =
        cleanText(value);

    const match =
        text.match(
            /[\d,]+/
        );

    if (!match) {
        return 0;
    }

    return Number(
        match[0].replace(/,/g, "")
    ) || 0;
}

/*
============================================================
EXTRACT TABLE ROWS
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

        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    return rows;
}

/*
============================================================
INTERPRET PORT CHARLOTTETOWN TABLE
============================================================
*/

function buildDataset(rows) {

    if (!rows.length) {
        throw new Error(
            "No table rows found on Port Charlottetown schedule page."
        );
    }

    /*
       Find the header row instead of assuming
       exact column positions.
    */

    let headerIndex = -1;
    let headers = [];

    for (
        let i = 0;
        i < rows.length;
        i++
    ) {

        const lower =
            rows[i].map(value =>
                value.toLowerCase()
            );

        const hasShip =
            lower.some(value =>
                value.includes("ship") ||
                value.includes("vessel")
            );

        const hasArrival =
            lower.some(value =>
                value.includes("arrival")
            );

        if (hasShip && hasArrival) {

            headerIndex = i;
            headers = lower;

            break;
        }
    }

    if (headerIndex === -1) {

        throw new Error(
            "Could not identify the cruise schedule table header."
        );
    }

    console.log(
        "Schedule headers:",
        rows[headerIndex]
    );

    function findColumn(words) {

        return headers.findIndex(
            header =>
                words.some(
                    word =>
                        header.includes(word)
                )
        );
    }

    const dateColumn =
        findColumn(["date"]);

    const arrivalColumn =
        findColumn(["arrival"]);

    const departureColumn =
        findColumn(["departure"]);

    const shipColumn =
        findColumn(["ship", "vessel"]);

    const passengersColumn =
        findColumn([
            "passenger",
            "guest"
        ]);

    const cruiseLineColumn =
        findColumn([
            "cruise line",
            "line"
        ]);

    const statusColumn =
        findColumn([
            "status"
        ]);

    if (shipColumn === -1) {

        throw new Error(
            "Ship column was not found."
        );
    }

    const arrivals = [];

    for (
        let i = headerIndex + 1;
        i < rows.length;
        i++
    ) {

        const cells =
            rows[i];

        const shipName =
            shipColumn >= 0
                ? cleanText(
                    cells[shipColumn]
                )
                : "";

        if (!shipName) {
            continue;
        }

        /*
           Date may be in its own column.
           If not, search the whole row.
        */

        let rawDate =
            dateColumn >= 0
                ? cells[dateColumn]
                : cells.join(" ");

        let date =
            normalizeDate(rawDate);

        if (!date) {

            date =
                normalizeDate(
                    cells.join(" ")
                );
        }

        if (!date) {

            console.warn(
                "Skipping row because date could not be read:",
                cells
            );

            continue;
        }

        const arrivalTime =
            arrivalColumn >= 0
                ? normalizeTime(
                    cells[arrivalColumn]
                )
                : "--:--";

        const departureTime =
            departureColumn >= 0
                ? normalizeTime(
                    cells[departureColumn]
                )
                : "--:--";

        const passengers =
            passengersColumn >= 0
                ? extractNumber(
                    cells[
                        passengersColumn
                    ]
                )
                : 0;

        const cruiseLine =
            cruiseLineColumn >= 0
                ? cleanText(
                    cells[
                        cruiseLineColumn
                    ]
                )
                : "";

        const status =
            statusColumn >= 0
                ? cleanText(
                    cells[statusColumn]
                )
                : "";

        arrivals.push({
            shipName,
            date,
            arrivalTime,
            departureTime,
            passengers,
            cruiseLine,
            status
        });
    }

    /*
       Remove duplicates.
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

    unique.sort(
        (a, b) => {

            if (a.date !== b.date) {

                return a.date.localeCompare(
                    b.date
                );
            }

            return String(
                a.arrivalTime
            ).localeCompare(
                String(
                    b.arrivalTime
                )
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
        `Downloading: ${SCHEDULE_URL}`
    );

    const response =
        await fetch(
            SCHEDULE_URL,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (compatible; VMM-Cruise-Schedule/1.0)",
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

    if (
        !html
            .toLowerCase()
            .includes("cruise")
    ) {

        throw new Error(
            "Downloaded page does not appear to contain cruise information."
        );
    }

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
       IMPORTANT:
       Never destroy the existing working JSON
       if the website changes or blocks GitHub.
    */

    if (total === 0) {

        throw new Error(
            "No Charlottetown cruise calls were found. Existing cruise-data.json was NOT overwritten."
        );
    }

    data[0]
        .upcomingArrivals
        .forEach(arrival => {

            console.log(
                `${arrival.date} | ` +
                `${arrival.shipName} | ` +
                `${arrival.arrivalTime}-${arrival.departureTime} | ` +
                `${arrival.passengers} passengers`
            );
        });

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            data,
            null,
            2
        )
    );

    console.log(
        `${OUTPUT_FILE} updated successfully.`
    );
}

main().catch(error => {

    console.error(
        "CRUISE UPDATE FAILED:"
    );

    console.error(error);

    process.exit(1);
});
