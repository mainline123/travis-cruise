const fs = require("fs");

const OUTPUT_FILE = "cruise-data.json";
const YEAR = 2026;

const PORTS = [
    {
        name: "Montego Bay",
        url: "https://www.cruisetimetables.com/montego-bay-jamaica-cruise-ship-schedule-2026.html"
    },
    {
        name: "Ocho Rios",
        url: "https://www.cruisetimetables.com/ocho-rios-jamaica-cruise-ship-schedule-2026.html"
    },
    {
        name: "Falmouth",
        url: "https://www.cruisetimetables.com/falmouth-jamaica-cruise-ship-schedule-2026.html"
    }
];


/* ============================================================
   MONTHS
============================================================ */

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
   CLEAN HTML
============================================================ */

function decodeEntities(text) {

    return String(text || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#038;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&ndash;/gi, "-")
        .replace(/&mdash;/gi, "-")
        .replace(/&#8211;/gi, "-")
        .replace(/&#8212;/gi, "-")
        .replace(/&#(\d+);/g, (_, number) =>
            String.fromCharCode(Number(number))
        );
}


function cleanText(html) {

    return decodeEntities(
        String(html || "")
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
    )
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
}


/* ============================================================
   HTML BLOCKS

   CruiseTimetables presents each sailing in repeating blocks.
   We extract useful visible text and links.
============================================================ */

function extractVisibleItems(html) {

    const items = [];

    const tokenRegex =
        /<(h[1-6]|td|th|div|span|a)\b[^>]*>([\s\S]*?)<\/\1>/gi;

    let match;

    while (
        (match = tokenRegex.exec(html)) !== null
    ) {

        const text =
            cleanText(match[2]);

        if (!text) {
            continue;
        }

        const pieces =
            text
                .split("\n")
                .map(value => value.trim())
                .filter(Boolean);

        for (const piece of pieces) {

            if (
                piece.length > 150
            ) {
                continue;
            }

            items.push(piece);
        }
    }

    return items;
}


/* ============================================================
   NORMALIZE TIME

   Examples:
   a 0800 d 1600
   a 0730 d 1645

   Missing or descriptive times become --:--
============================================================ */

function militaryToTime(value) {

    if (!value) {
        return "--:--";
    }

    const digits =
        String(value)
            .replace(/\D/g, "");

    if (digits.length !== 4) {
        return "--:--";
    }

    const hour =
        Number(
            digits.substring(0, 2)
        );

    const minute =
        Number(
            digits.substring(2, 4)
        );

    if (
        hour > 23 ||
        minute > 59
    ) {
        return "--:--";
    }

    return (
        String(hour).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0")
    );
}


function extractTimes(value) {

    const text =
        String(value || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

    let arrivalTime =
        "--:--";

    let departureTime =
        "--:--";


    const arrivalMatch =
        text.match(
            /\ba\s+(\d{4})\b/i
        );

    const departureMatch =
        text.match(
            /\bd\s+(\d{4})\b/i
        );


    if (arrivalMatch) {

        arrivalTime =
            militaryToTime(
                arrivalMatch[1]
            );
    }


    if (departureMatch) {

        departureTime =
            militaryToTime(
                departureMatch[1]
            );
    }


    return {
        arrivalTime,
        departureTime
    };
}


/* ============================================================
   DATE
============================================================ */

function buildDate(
    monthNumber,
    day
) {

    return (
        YEAR +
        "-" +
        String(
            monthNumber
        ).padStart(2, "0") +
        "-" +
        String(
            day
        ).padStart(2, "0")
    );
}


/* ============================================================
   IDENTIFY TEXT
============================================================ */

function isMonth(value) {

    return Object.prototype
        .hasOwnProperty.call(
            MONTHS,
            String(value)
                .trim()
                .toLowerCase()
        );
}


function getDay(value) {

    const match =
        String(value || "")
            .trim()
            .match(
                /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})$/i
            );

    if (!match) {
        return null;
    }

    return Number(
        match[1]
    );
}


function isPassengerNumber(value) {

    const text =
        String(value || "")
            .trim()
            .replace(/,/g, "");

    return /^\d{2,5}$/.test(text);
}


function passengerNumber(value) {

    return Number(
        String(value || "")
            .replace(/,/g, "")
    ) || 0;
}


function isTimeValue(value) {

    const text =
        String(value || "")
            .trim()
            .toLowerCase();

    return (
        /^a\s+\d{4}\s+d\s+\d{4}$/.test(text) ||
        /^a\s+.+\s+d\s+.+$/.test(text)
    );
}


function ignoreItem(value) {

    const text =
        String(value || "")
            .trim();

    const lower =
        text.toLowerCase();

    if (!text) {
        return true;
    }

    if (
        lower === "day" ||
        lower === "ship" ||
        lower === "times" ||
        lower === "passengers" ||
        lower === "pass'gers" ||
        lower === "cruise line" ||
        lower === "all" ||
        lower === "summary"
    ) {
        return true;
    }

    if (
        lower.includes(
            "cruise ship schedule"
        )
    ) {
        return true;
    }

    if (
        lower.startsWith(
            "legend"
        )
    ) {
        return true;
    }

    if (
        lower === "change" ||
        lower === "year"
    ) {
        return true;
    }

    if (
        lower.includes(
            "prev"
        ) &&
        lower.includes(
            "next"
        )
    ) {
        return true;
    }

    return false;
}


/* ============================================================
   FALLBACK LINE PARSER

   This parses the visible page structure:

   October
   Wed 21
   Carnival Horizon
   a 0900 d 1700
   3974

   Cruise line logos are ignored because the Jamaica landscape
   only requires port, ship, times and passenger total.
============================================================ */

function parseScheduleText(
    html,
    portName
) {

    const text =
        cleanText(html);

    const lines =
        text
            .split("\n")
            .map(value =>
                value
                    .replace(/\s+/g, " ")
                    .trim()
            )
            .filter(Boolean);


    const arrivals = [];

    let currentMonth =
        null;

    let currentDay =
        null;


    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i];


        /* MONTH */

        if (
            isMonth(line)
        ) {

            currentMonth =
                MONTHS[
                    line.toLowerCase()
                ];

            continue;
        }


        /* DAY */

        const day =
            getDay(line);

        if (
            day !== null
        ) {

            currentDay =
                day;

            continue;
        }


        if (
            !currentMonth ||
            !currentDay
        ) {
            continue;
        }


        if (
            ignoreItem(line)
        ) {
            continue;
        }


        /*
           A time line tells us that the preceding useful
           line should be the ship name.
        */

        if (
            isTimeValue(line)
        ) {

            let shipName =
                "";

            for (
                let back = i - 1;
                back >= 0 &&
                back >= i - 8;
                back--
            ) {

                const candidate =
                    lines[back];

                if (
                    ignoreItem(candidate)
                ) {
                    continue;
                }

                if (
                    isMonth(candidate) ||
                    getDay(candidate) !== null ||
                    isTimeValue(candidate) ||
                    isPassengerNumber(candidate)
                ) {
                    continue;
                }

                if (
                    candidate.includes("logo")
                ) {
                    continue;
                }

                shipName =
                    candidate;

                break;
            }


            if (!shipName) {
                continue;
            }


            let passengers =
                0;


            for (
                let forward = i + 1;
                forward < lines.length &&
                forward <= i + 5;
                forward++
            ) {

                const candidate =
                    lines[forward];

                if (
                    getDay(candidate) !== null ||
                    isMonth(candidate)
                ) {
                    break;
                }

                if (
                    isPassengerNumber(
                        candidate
                    )
                ) {

                    passengers =
                        passengerNumber(
                            candidate
                        );

                    break;
                }
            }


            const times =
                extractTimes(
                    line
                );


            arrivals.push({

                shipName,

                date:
                    buildDate(
                        currentMonth,
                        currentDay
                    ),

                arrivalTime:
                    times.arrivalTime,

                departureTime:
                    times.departureTime,

                passengers,

                portName
            });


            continue;
        }


        /*
           Some CruiseTimetables entries have NO arrival or
           departure times. Example: a ship may simply show:

           Viking Mars
           930

           Detect ship + passenger count.
        */

        if (
            !isPassengerNumber(line)
        ) {

            let nextPassenger =
                0;


            for (
                let forward = i + 1;
                forward < lines.length &&
                forward <= i + 3;
                forward++
            ) {

                const candidate =
                    lines[forward];

                if (
                    getDay(candidate) !== null ||
                    isMonth(candidate)
                ) {
                    break;
                }

                if (
                    isTimeValue(candidate)
                ) {
                    nextPassenger = 0;
                    break;
                }

                if (
                    isPassengerNumber(
                        candidate
                    )
                ) {

                    nextPassenger =
                        passengerNumber(
                            candidate
                        );

                    break;
                }
            }


            if (
                nextPassenger > 0 &&
                !line.toLowerCase()
                    .includes("logo") &&
                !ignoreItem(line)
            ) {

                const date =
                    buildDate(
                        currentMonth,
                        currentDay
                    );


                const duplicate =
                    arrivals.some(
                        arrival =>
                            arrival.shipName === line &&
                            arrival.date === date
                    );


                if (!duplicate) {

                    arrivals.push({

                        shipName:
                            line,

                        date,

                        arrivalTime:
                            "--:--",

                        departureTime:
                            "--:--",

                        passengers:
                            nextPassenger,

                        portName
                    });
                }
            }
        }
    }


    /*
       Remove accidental duplicates.
    */

    const unique =
        [];

    const seen =
        new Set();


    for (
        const arrival of arrivals
    ) {

        const key =
            [
                arrival.date,
                arrival.shipName,
                arrival.arrivalTime,
                arrival.departureTime
            ].join("|");


        if (
            seen.has(key)
        ) {
            continue;
        }


        seen.add(key);

        unique.push(
            arrival
        );
    }


    unique.sort(
        (a, b) => {

            if (
                a.date !== b.date
            ) {

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


    return unique;
}


/* ============================================================
   DOWNLOAD PORT
============================================================ */

async function downloadPort(
    port
) {

    console.log("");
    console.log(
        `Downloading ${port.name}...`
    );

    console.log(
        port.url
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


    if (
        !response.ok
    ) {

        throw new Error(
            `${port.name} returned HTTP ${response.status}`
        );
    }


    const html =
        await response.text();


    console.log(
        `${port.name}: downloaded ${html.length} characters.`
    );


    const arrivals =
        parseScheduleText(
            html,
            port.name
        );


    console.log(
        `${port.name}: ${arrivals.length} cruise calls found.`
    );


    /*
       Print first few so GitHub logs let us verify
       the parser without opening the JSON.
    */

    arrivals
        .slice(0, 8)
        .forEach(
            arrival => {

                console.log(
                    `${arrival.date} | ` +
                    `${arrival.shipName} | ` +
                    `${arrival.arrivalTime}-${arrival.departureTime} | ` +
                    `${arrival.passengers} passengers`
                );
            }
        );


    return arrivals;
}


/* ============================================================
   MAIN
============================================================ */

async function main() {

    console.log(
        "Jamaica cruise updater starting..."
    );

    console.log(
        new Date().toISOString()
    );


    const output =
        [];

    let totalCalls =
        0;


    for (
        const port of PORTS
    ) {

        try {

            const arrivals =
                await downloadPort(
                    port
                );


            /*
               Safety:
               If a source unexpectedly returns zero calls,
               don't silently treat that as valid.
            */

            if (
                arrivals.length === 0
            ) {

                throw new Error(
                    `No cruise calls parsed for ${port.name}`
                );
            }


            output.push({

                recordType:
                    "port",

                name:
                    port.name,

                upcomingArrivals:
                    arrivals.map(
                        arrival => ({

                            shipName:
                                arrival.shipName,

                            date:
                                arrival.date,

                            arrivalTime:
                                arrival.arrivalTime,

                            departureTime:
                                arrival.departureTime,

                            passengers:
                                arrival.passengers

                        })
                    ),

                scrapedAt:
                    new Date()
                        .toISOString()

            });


            totalCalls +=
                arrivals.length;

        }

        catch (
            error
        ) {

            console.error(
                `${port.name} FAILED:`,
                error.message
            );
        }
    }


    /*
       We require all three main Jamaica ports.

       This prevents a temporary website problem from
       replacing the good JSON with incomplete data.
    */

    if (
        output.length !==
        PORTS.length
    ) {

        throw new Error(
            `Only ${output.length} of ${PORTS.length} Jamaica ports were successfully updated. Existing cruise-data.json was NOT overwritten.`
        );
    }


    if (
        totalCalls === 0
    ) {

        throw new Error(
            "No Jamaica cruise calls were found. Existing cruise-data.json was NOT overwritten."
        );
    }


    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            output,
            null,
            2
        )
    );


    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "JAMAICA CRUISE UPDATE SUCCESSFUL"
    );

    console.log(
        `${totalCalls} total cruise calls saved.`
    );

    console.log(
        "Ports: Montego Bay, Ocho Rios, Falmouth"
    );

    console.log(
        "cruise-data.json updated successfully."
    );

    console.log(
        "========================================"
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
                "JAMAICA CRUISE UPDATE FAILED:"
            );

            console.error(
                error
            );

            process.exit(1);
        }
    );
