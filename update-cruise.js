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

    const letters =
        cleaned.match(/[A-Za-z]/g);

    if (
        !letters ||
        letters.length < 2
    ) {
        return false;
    }

    if (
        cleaned.length > 80
    ) {
        return false;
    }

    const lower =
        cleaned.toLowerCase();

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

    if (
        badText.some(
            item =>
                lower === item
        )
    ) {
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


        /* ====================================================
           RECORD WITH PUBLISHED TIMES
        ==================================================== */

        const timeMatch =
            line.match(
                /\ba\s*(\d{3,4})\s*d\s*(\d{3,4})\b/i
            );


        if (timeMatch) {

            let shipName = null;


            for (
                let back = i - 1;
                back >= Math.max(
                    0,
                    i - 5
                );
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


        /* ====================================================
           RECORD WITHOUT PUBLISHED TIMES
        ==================================================== */

        if (
            isValidShipName(
                line
            )
        ) {

            let passengers = null;


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

                    break;
                }


                if (
                    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}$/i
                        .test(
                            lines[forward]
                        )
                ) {

                    break;
                }
            }


            if (passengers) {

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
        `${portName}: parsed ${arrivals.length} raw records`
    );


    return arrivals;
}


/* ============================================================
   DETERMINE WHICH DUPLICATE IS BETTER
============================================================ */

function hasRealTimes(arrival) {

    return (
        arrival.arrivalTime &&
        arrival.departureTime &&
        arrival.arrivalTime !== "--:--" &&
        arrival.departureTime !== "--:--"
    );
}


/* ============================================================
   CLEAN + REMOVE DUPLICATES
============================================================ */

function cleanArrivals(arrivals, portName) {

    /*
       STEP 1:
       Remove junk ship names such as 留.
    */

    const validArrivals =
        arrivals.filter(
            arrival => {

                const shipName =
                    String(
                        arrival.shipName || ""
                    ).trim();


                if (
                    !/[A-Za-z]/.test(
                        shipName
                    )
                ) {

                    console.log(
                        `${portName}: removed junk ship "${shipName}"`
                    );

                    return false;
                }


                return true;
            }
        );


    /*
       STEP 2:
       One record per:

       DATE + SHIP NAME

       If we encounter the same ship twice,
       prefer the record containing real
       arrival/departure times.
    */

    const unique =
        new Map();


    validArrivals.forEach(
        arrival => {

            const shipKey =
                String(
                    arrival.shipName
                )
                    .toLowerCase()
                    .replace(/\s+/g, " ")
                    .trim();


            const key =
                arrival.date +
                "|" +
                shipKey;


            if (
                !unique.has(
                    key
                )
            ) {

                unique.set(
                    key,
                    arrival
                );

                return;
            }


            const existing =
                unique.get(
                    key
                );


            const existingHasTimes =
                hasRealTimes(
                    existing
                );


            const newHasTimes =
                hasRealTimes(
                    arrival
                );


            /*
               Replace the no-time version
               with the timed version.
            */

            if (
                !existingHasTimes &&
                newHasTimes
            ) {

                console.log(
                    `${portName}: keeping timed version of ${arrival.shipName}`
                );

                unique.set(
                    key,
                    arrival
                );

                return;
            }


            /*
               If existing version already
               has times, keep it.
            */

            if (
                existingHasTimes &&
                !newHasTimes
            ) {

                console.log(
                    `${portName}: removed duplicate no-time version of ${arrival.shipName}`
                );

                return;
            }


            /*
               If both versions have the same
               time quality, keep the one with
               a passenger count.
            */

            if (
                !existing.passengers &&
                arrival.passengers
            ) {

                unique.set(
                    key,
                    arrival
                );
            }
        }
    );


    const cleaned =
        Array.from(
            unique.values()
        );


    /*
       STEP 3:
       Sort chronologically.
    */

    cleaned.sort(
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
                hasRealTimes(a)
                    ? a.arrivalTime
                    : "99:99";


            const timeB =
                hasRealTimes(b)
                    ? b.arrivalTime
                    : "99:99";


            if (
                timeA !== timeB
            ) {

                return (
                    timeA.localeCompare(
                        timeB
                    )
                );
            }


            return String(
                a.shipName
            ).localeCompare(
                String(
                    b.shipName
                )
            );
        }
    );


    console.log(
        `${portName}: ${cleaned.length} unique cruise calls after cleanup`
    );


    return cleaned;
}


/* ============================================================
   DOWNLOAD ONE PORT
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
        cleanArrivals(
            rawArrivals,
            port.name
        );


    if (
        arrivals.length === 0
    ) {

        throw new Error(
            `${port.name}: No cruise calls parsed`
        );
    }


    return {

        recordType:
            "port",

        name:
            port.name,

        upcomingArrivals:
            arrivals,

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
       DO NOT WRITE PARTIAL DATA
    */

    if (
        results.length !==
        PORTS.length
    ) {

        throw new Error(
            "Not all Jamaica ports were successfully downloaded."
        );
    }


    /*
       FINAL SAFETY CHECK
    */

    results.forEach(
        port => {

            port.upcomingArrivals =
                port.upcomingArrivals.filter(
                    arrival => {

                        const shipName =
                            String(
                                arrival.shipName || ""
                            ).trim();


                        return (
                            /[A-Za-z]/.test(
                                shipName
                            )
                        );
                    }
                );
        }
    );


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


    /*
       WRITE CLEAN DATA
    */

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
        `Saved ${totalCalls} unique Jamaica cruise calls to ${OUTPUT_FILE}`
    );


    /*
       SHOW FIRST 15 RECORDS
       IN GITHUB ACTION LOG
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


                    const timeA =
                        hasRealTimes(a)
                            ? a.arrivalTime
                            : "99:99";


                    const timeB =
                        hasRealTimes(b)
                            ? b.arrivalTime
                            : "99:99";


                    return (
                        timeA.localeCompare(
                            timeB
                        )
                    );
                }
            );


    console.log("");
    console.log(
        "Next Jamaica cruise calls:"
    );


    allCalls
        .slice(0, 15)
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
    .catch(
        error => {

            console.error("");
            console.error(
                "Jamaica cruise update FAILED:"
            );

            console.error(
                error.message
            );

            process.exit(1);
        }
    );
