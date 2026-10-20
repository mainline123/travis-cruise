const fs = require("fs");

const OUTPUT_FILE = "cruise-data.json";
const YEAR = 2026;

const PORTS = [
    {
        name: "Montego Bay",
        url: `https://www.cruisetimetables.com/montego-bay-jamaica-cruise-ship-schedule-${YEAR}.html`
    },
    {
        name: "Ocho Rios",
        url: `https://www.cruisetimetables.com/ocho-rios-jamaica-cruise-ship-schedule-${YEAR}.html`
    },
    {
        name: "Falmouth",
        url: `https://www.cruisetimetables.com/falmouth-jamaica-cruise-ship-schedule-${YEAR}.html`
    }
];

const MONTHS = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
};


/* ============================================================
   HTML TO TEXT
============================================================ */

function cleanText(html) {

    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<\/td>/gi, "\n")
        .replace(/<\/th>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&ndash;/gi, "-")
        .replace(/&mdash;/gi, "-")
        .replace(/&#x27;/gi, "'")
        .replace(/&#(\d+);/g, (match, number) => {
            return String.fromCharCode(Number(number));
        })
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
}


/* ============================================================
   DATE
============================================================ */

function makeDate(year, month, day) {

    return (
        String(year) +
        "-" +
        String(month).padStart(2, "0") +
        "-" +
        String(day).padStart(2, "0")
    );
}


/* ============================================================
   TIME
============================================================ */

function normalizeTime(value) {

    if (!value) {
        return "--:--";
    }

    const digits =
        String(value)
            .replace(/\D/g, "");

    if (digits.length === 3) {

        return (
            "0" +
            digits[0] +
            ":" +
            digits.slice(1)
        );
    }

    if (digits.length === 4) {

        return (
            digits.slice(0, 2) +
            ":" +
            digits.slice(2)
        );
    }

    return "--:--";
}


/* ============================================================
   SHIP NAME VALIDATION
============================================================ */

function isValidShipName(name) {

    if (!name) {
        return false;
    }

    const cleaned =
        String(name).trim();

    /*
       Ship names must contain at least
       two normal Latin letters.

       This rejects junk characters such
       as 留 that were accidentally parsed
       as a ship name.
    */

    if (!/[A-Za-z].*[A-Za-z]/.test(cleaned)) {
        return false;
    }

    /*
       Reject obvious page/navigation text.
    */

    const badText = [
        "cruise timetable",
        "cruise schedule",
        "cruise ships",
        "arrivals",
        "departures",
        "jamaica",
        "montego bay",
        "ocho rios",
        "falmouth",
        "passengers",
        "calendar",
        "home",
        "ports",
        "ships"
    ];

    const lower =
        cleaned.toLowerCase();

    if (
        badText.some(
            item =>
                lower === item
        )
    ) {
        return false;
    }

    /*
       Avoid extremely long page text
       accidentally becoming a ship name.
    */

    if (cleaned.length > 80) {
        return false;
    }

    return true;
}


/* ============================================================
   PARSE SCHEDULE
============================================================ */

function parseScheduleText(text, portName) {

    const lines =
        text
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

    const arrivals = [];

    let currentMonth = null;
    let currentDay = null;

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i];

        const lower =
            line.toLowerCase();


        /* MONTH */

        if (
            Object.prototype.hasOwnProperty.call(
                MONTHS,
                lower
            )
        ) {

            currentMonth =
                MONTHS[lower];

            continue;
        }


        /* DAY */

        const dayMatch =
            line.match(
                /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})$/i
            );

        if (dayMatch) {

            currentDay =
                Number(
                    dayMatch[1]
                );

            continue;
        }


        if (
            !currentMonth ||
            !currentDay
        ) {
            continue;
        }


        /* ==========================================
           NORMAL RECORD WITH TIMES
        ========================================== */

        const timeMatch =
            line.match(
                /\ba\s*(\d{3,4})\s*d\s*(\d{3,4})\b/i
            );

        if (timeMatch) {

            let shipName = null;


            /*
               Search backwards for the first
               sensible ship name.
            */

            for (
                let back = i - 1;
                back >= Math.max(0, i - 5);
                back--
            ) {

                const candidate =
                    lines[back].trim();

                if (
                    isValidShipName(
                        candidate
                    )
                ) {

                    shipName =
                        candidate;

                    break;
                }
            }


            if (!shipName) {
                continue;
            }


            /*
               Look forward for passenger count.
            */

            let passengers = null;

            for (
                let forward = i + 1;
                forward <= Math.min(
                    lines.length - 1,
                    i + 5
                );
                forward++
            ) {

                const candidate =
                    lines[forward]
                        .replace(/,/g, "")
                        .trim();

                if (
                    /^\d{2,5}$/.test(
                        candidate
                    )
                ) {

                    passengers =
                        Number(
                            candidate
                        );

                    break;
                }
            }


            arrivals.push({

                shipName:
                    shipName,

                date:
                    makeDate(
                        YEAR,
                        currentMonth,
                        currentDay
                    ),

                arrivalTime:
                    normalizeTime(
                        timeMatch[1]
                    ),

                departureTime:
                    normalizeTime(
                        timeMatch[2]
                    ),

                passengers:
                    passengers || 0
            });


            continue;
        }


        /* ==========================================
           RECORD WITHOUT TIMES
        ========================================== */

        if (
            isValidShipName(line)
        ) {

            /*
               Check nearby lines for a
               passenger number.
            */

            let passengers = null;

            let passengerLineIndex =
                null;


            for (
                let forward = i + 1;
                forward <= Math.min(
                    lines.length - 1,
                    i + 4
                );
                forward++
            ) {

                const candidate =
                    lines[forward]
                        .replace(/,/g, "")
                        .trim();

                if (
                    /^\d{2,5}$/.test(
                        candidate
                    )
                ) {

                    passengers =
                        Number(
                            candidate
                        );

                    passengerLineIndex =
                        forward;

                    break;
                }


                /*
                   Stop if we reach another
                   obvious date/day.
                */

                if (
                    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}$/i
                        .test(
                            lines[forward]
                        )
                ) {
                    break;
                }
            }


            if (
                passengers &&
                passengerLineIndex
            ) {

                arrivals.push({

                    shipName:
                        line,

                    date:
                        makeDate(
                            YEAR,
                            currentMonth,
                            currentDay
                        ),

                    arrivalTime:
                        "--:--",

                    departureTime:
                        "--:--",

                    passengers:
                        passengers
                });
            }
        }
    }


    console.log(
        `${portName}: parsed ${arrivals.length} raw cruise calls`
    );

    return arrivals;
}


/* ============================================================
   DEDUPLICATE
============================================================ */

function deduplicateArrivals(arrivals) {

    /*
       FIRST:
       Remove exact duplicates.
    */

    const exactMap =
        new Map();

    arrivals.forEach(arrival => {

        const key = [
            arrival.date,
            arrival.shipName
                .toLowerCase()
                .trim(),
            arrival.arrivalTime,
            arrival.departureTime,
            arrival.passengers
        ].join("|");

        if (!exactMap.has(key)) {
            exactMap.set(
                key,
                arrival
            );
        }
    });


    let cleaned =
        Array.from(
            exactMap.values()
        );


    /*
       SECOND:
       On the same date, if two records
       have the same passenger count and
       one record is clearly weaker/junk,
       keep the better ship-name record.

       This specifically prevents the
       bogus Oct 23 entry from surviving
       beside Viking Mars.
    */

    const groups =
        new Map();

    cleaned.forEach(arrival => {

        const key = [
            arrival.date,
            arrival.passengers
        ].join("|");

        if (!groups.has(key)) {
            groups.set(
                key,
                []
            );
        }

        groups.get(key)
            .push(arrival);
    });


    const finalArrivals = [];


    groups.forEach(group => {

        if (group.length === 1) {

            finalArrivals.push(
                group[0]
            );

            return;
        }


        /*
           Do not blindly remove legitimate
           ships if they happen to have the
           same passenger capacity.

           Only remove entries whose ship
           name fails our validation.
        */

        const valid =
            group.filter(
                arrival =>
                    isValidShipName(
                        arrival.shipName
                    )
            );


        if (valid.length > 0) {

            valid.forEach(
                arrival =>
                    finalArrivals.push(
                        arrival
                    )
            );

        } else {

            finalArrivals.push(
                group[0]
            );
        }
    });


    finalArrivals.sort(
        (a, b) => {

            if (
                a.date !== b.date
            ) {

                return (
                    a.date.localeCompare(
                        b.date
                    )
                );
            }


            const timeA =
                a.arrivalTime === "--:--"
                    ? "99:99"
                    : a.arrivalTime;

            const timeB =
                b.arrivalTime === "--:--"
                    ? "99:99"
                    : b.arrivalTime;


            if (
                timeA !== timeB
            ) {

                return (
                    timeA.localeCompare(
                        timeB
                    )
                );
            }


            return (
                a.shipName.localeCompare(
                    b.shipName
                )
            );
        }
    );


    return finalArrivals;
}


/* ============================================================
   DOWNLOAD PORT
============================================================ */

async function downloadPort(port) {

    console.log(
        `Downloading ${port.name}...`
    );

    const response =
        await fetch(
            port.url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155 Safari/537.36",
                    "Accept":
                        "text/html,application/xhtml+xml"
                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `${port.name}: HTTP ${response.status}`
        );
    }


    const html =
        await response.text();


    console.log(
        `${port.name}: downloaded ${html.length} characters`
    );


    const text =
        cleanText(
            html
        );


    const rawArrivals =
        parseScheduleText(
            text,
            port.name
        );


    const arrivals =
        deduplicateArrivals(
            rawArrivals
        );


    console.log(
        `${port.name}: ${arrivals.length} cruise calls after cleanup`
    );


    if (
        arrivals.length === 0
    ) {

        throw new Error(
            `${port.name}: No cruise calls parsed`
        );
    }


    return {
        recordType: "port",
        name: port.name,
        upcomingArrivals: arrivals,
        scrapedAt:
            new Date().toISOString()
    };
}


/* ============================================================
   MAIN
============================================================ */

async function main() {

    console.log(
        "Starting Jamaica cruise schedule update..."
    );


    const results = [];


    for (
        const port of PORTS
    ) {

        const result =
            await downloadPort(
                port
            );

        results.push(
            result
        );
    }


    /*
       Safety check:
       Never overwrite the working JSON
       if one of the Jamaica ports failed.
    */

    if (
        results.length !==
        PORTS.length
    ) {

        throw new Error(
            "Not all Jamaica ports were successfully downloaded."
        );
    }


    const totalCalls =
        results.reduce(
            (total, port) =>
                total +
                port.upcomingArrivals.length,
            0
        );


    if (
        totalCalls === 0
    ) {

        throw new Error(
            "No Jamaica cruise calls found. Existing JSON was not overwritten."
        );
    }


    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            results,
            null,
            2
        ) + "\n",
        "utf8"
    );


    console.log("");
    console.log(
        `Saved ${totalCalls} Jamaica cruise calls to ${OUTPUT_FILE}`
    );


    /*
       Show the first upcoming records
       in the GitHub Actions log.
    */

    const allCalls =
        results
            .flatMap(
                port =>
                    port.upcomingArrivals
                        .map(
                            arrival => ({
                                port:
                                    port.name,
                                ...arrival
                            })
                        )
            )
            .sort(
                (a, b) => {

                    if (
                        a.date !== b.date
                    ) {

                        return (
                            a.date.localeCompare(
                                b.date
                            )
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


    console.log("");
    console.log(
        "Next Jamaica cruise calls:"
    );


    allCalls
        .slice(0, 12)
        .forEach(
            arrival => {

                console.log(
                    `${arrival.date} | ${arrival.port} | ${arrival.shipName} | ${arrival.arrivalTime}-${arrival.departureTime} | ${arrival.passengers} guests`
                );
            }
        );
}


/* ============================================================
   RUN
============================================================ */

main()
    .catch(error => {

        console.error("");
        console.error(
            "Jamaica cruise update FAILED:"
        );

        console.error(
            error.message
        );

        process.exit(1);
    });
