const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    isJidBroadcast,
    Browsers,
    delay
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const {
    serialize
} = require("./lib/serialize");
const {
    Message,
    Image,
    Sticker,
} = require("./lib/Base");
const pino = require("pino");
logger = pino({
    level: "silent"
});
const PDMFUNCTION = require("./lib")
const path = require("path");
const events = require("./lib/event");
const got = require("got");
const { UpdateLocal } = require("./lib")

const config = require("./config");
const package = require("./package.json");
const {
    PluginDB
} = require("./database/plugins");
const {
    Greetings,
    GroupUpdates,
    BanStick,
} = require("./lib/Greetings");
const {
    getcall
} = require("./database/callAction");

const {
    PausedChats,
    stickban
} = require("./database");
const store = makeInMemoryStore({
    logger: pino().child({
        level: "silent",
        stream: "store"
    }),
});


async function auth() {
    if (!fs.existsSync("./session/creds.json")) {
        const {
            MakeSession
        } = require("./lib/session");
        await MakeSession(config.SESSION_ID, "./session/creds.json").then(
            console.log("Vesrion : " + require("./package.json").version)
        );
    }
}
auth()
fs.readdirSync("./database/").forEach((plugin) => {
    if (path.extname(plugin).toLowerCase() == ".js") {
        require("./database/" + plugin);
    }
});


async function Aurora() {
    let {
        version
    } = await fetchLatestBaileysVersion()

    console.log("Syncing Database");
    await config.DATABASE.sync();
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(__dirname + "/session/");
    let conn = makeWASocket({
        logger: pino({
            level: 'silent'
        }),
        printQRInTerminal: true,
        browser: Browsers.macOS("Desktop"),
        version,
        downloadHistory: false,
        syncFullHistory: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: (jid) => isJidBroadcast(jid),
        },
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg.message || ""
        }
    })
    store.bind(conn.ev);
    //store.readFromFile("./database/store.json");
    setInterval(() => {
        store.writeToFile("./database/store.json");
        console.log("saved store");
    }, 60 * 1000);

    conn.ev.on("connection.update", async (s) => {
        const {
            connection,
            lastDisconnect
        } = s;
        if (connection === "connecting") {
            console.log("Aurora");
            console.log("ℹ️ Connecting to WhatsApp... Please Wait.");
        }

        if (
            connection === "close" &&
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode != 401
        ) {
            console.log(lastDisconnect.error.output.payload);
        }

        if (connection === "open") {

            let creds = require("./session/creds.json")
            await conn.sendMessage(conn.user.id, {
                text: "```----- 𝞓𝙇𝞘𝞢𝞜-𝞓𝙇𝙁𝞓-𝞛𝘿 -----\n\nVersion : " + package.version + "\nStatus  : Connected!\nNumber  : " + conn.user.id.split(":")[0] + "\nPlatform: " + creds.platform + "\n\n----- 𝞓𝙇𝞘𝞢𝞜-𝞓𝙇𝙁𝞓-𝞛𝘿 -----```"
            });

            console.log("✅ Login Successful!");
            console.log("⬇️ Installing External Plugins...");

            let plugins = await PluginDB.findAll();
            plugins.map(async (plugin) => {
                if (!fs.existsSync("./plugins/" + plugin.dataValues.name + ".js")) {
                    console.log(plugin.dataValues.name);
                    var response = await got(plugin.dataValues.url);
                    if (response.statusCode == 200) {
                        fs.writeFileSync(
                            "./plugins/" + plugin.dataValues.name + ".js",
                            response.body
                        );
                        require("./plugins/" + plugin.dataValues.name + ".js");
                    }
                }
            });

            console.log("⬇️  Installing Plugins...");
try{
            fs.readdirSync("./plugins").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() == ".js") {
                    require("./plugins/" + plugin);
                }
            });
}catch(err){console.log("[PLUGIN ERROR]: "+err)}
            console.log("✅ Plugins Installed!");

            try {
                conn.ev.on("creds.update", saveCreds);

                conn.ev.on("group-participants.update", async (data) => {
                    Greetings(data, conn);
                });
                conn.ev.on("groups.update", async (data) => {
                    GroupUpdates(data, conn);
                })
                conn.ev.on("messages.upsert", async (m) => {
                    if (m.type !== "notify") return;
                    let ms = m.messages[0];
                    let msg = await serialize(JSON.parse(JSON.stringify(ms)), conn);
                    getStickerMessage(msg);
                })

                function getStickerMessage(stickerMessage) {
                    if (stickerMessage && stickerMessage.message && stickerMessage.message.stickerMessage) {
                        let mediakey = stickerMessage.message.stickerMessage.mediaKey;
                        BanStick(mediakey, stickerMessage, conn)
                    } else {
                        return;
                    }
                }


                conn.ev.on("call", async (c) => {
                    const callList = await getcall();
                    c = c.map(c => c)
                    c = c[0]
                    let {status,from,id} = c
                    let frmid;
                    if (from.includes(":")) {
                        frmid = await from.split(":")[0]
                    } else {
                        frmid = await from.split("@")[0]
                    }
                    let res = callList.some(item => item.dataValues && item.dataValues.chatId.split("@")[0] === frmid);

                    console.log(c)
                    console.log("\n\n" + res)
                    if (status == "offer") {
                        if (!res) {
                            await conn.rejectCall(id, from);
                            return conn.sendMessage(from, {
                                text: "Sorry no calls. Please use Text or Voice Message\n> Automated System"
                            });
                        }
                    }

                })




                conn.ev.on("messages.upsert", async (m) => {
                    if (m.type !== "notify") return;
                    let ms = m.messages[0];
                    let msg = await serialize(JSON.parse(JSON.stringify(ms)), conn);
                    /*  let owners = conn.user.id || config.SUDO*/
                    if (!msg.message) return;
                    let text_msg = msg.body;
                    if (!msg) return;
                    const regex = new RegExp(`${config.HANDLERS}( ?resume)`, "is");
                    isResume = regex.test(text_msg);
                    const chatId = msg.from;
                    try {
                        const pausedChats = await PausedChats.getPausedChats();
                        if (
                            pausedChats.some(
                                (pausedChat) => pausedChat.chatId === chatId && !isResume
                            )
                        ) {
                            return;
                        }
                    } catch (error) {
                        console.error(error);
                    }

                    if (text_msg) {
                        const from = msg.from.endsWith("@g.us") ? `[ ${(await conn.groupMetadata(msg.from)).subject} ] : ${msg.pushName}` : msg.pushName;
                        const sender = msg.sender;
                        console.log(`-------------\n${await from} : ${await text_msg}`);

                    }
                    events.commands.map(async (command) => {
                        if (
                            msg.key.fromMe === false && command.fromMe === true &&
                            !config.SUDO.split(",").includes(
                                msg.sender.split("@")[0] || msg.isSelf
                            )
                        )
                            return;
                        let comman;

                        try {
                            comman = text_msg.split(" ")[0];

                        } catch {
                            comman = false;
                        }
                        if (text_msg)
                            /*if(!text_msg.startsWith(config.HANDLERS) && !text_msg.startsWith(">") && !text_msg.startsWith(command.pattern)) return*/
                            if (
                                command.pattern &&
                                command.pattern.test(comman.toLowerCase())
                            ) {
                                var match = text_msg.trim().split(/ +/).slice(1).join(" ");
                                whats = new Message(conn, msg, ms);

                                command.function(whats, match, msg, conn);
                            } else if (text_msg && command.on === "text") {

                            msg.prefix = "^";
                            whats = new Message(conn, msg, ms);
                            command.function(whats, text_msg, msg, conn, m);
                        } else if (
                            (command.on === "image" || command.on === "photo") &&
                            msg.type === "imageMessage"
                        ) {
                            whats = new Image(conn, msg, ms);
                            command.function(whats, text_msg, msg, conn, m, ms);
                        } else if (
                            command.on === "sticker" &&
                            msg.type === "stickerMessage"
                        ) {

                            whats = new Sticker(conn, msg, ms);
                            command.function(whats, msg, conn, m, ms);
                        }
                    });
                });
            } catch (e) {
                console.log(e + "\n\n\n\n\n" + JSON.stringify(msg));
            }
        }
    });
    process.on("uncaughtException", async (err) => {
        // Extract the error message
        let error = err.message;

        // Send an error report message to a user
        await conn.sendMessage(conn.user.id, {
            text: "```---ERROR REPORT---\n\nVersion : " + package.version + "\nMessage : \nError   : " + error + "\nJid     : " + conn.user.id + "\ncommand : \nPlatform: " + creds.platform + "\n\n----- 𝞓𝙇𝞘𝞢𝞜-𝞓𝙇𝙁𝞓-𝞛𝘿 -----```"
        });

        // Log the error details to the console
        await console.log("\n\n\n\n" + err + "\n\n\n\n");
    });
}


setTimeout(() => {
    Aurora();
}, 500);

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
app.post('/restart', (req, res) => {
  console.log("[Restarting]");
  process.send('reset');
    res.sendStatus(200); 
});
app.post('/update', (req, res) => {
    console.log("[Updating]");
    UpdateLocal()
      res.sendStatus(200); 
  });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'lib/BASE/index.html')); });
app.listen(port, () => console.log(`cortana Server listening on port http://localhost:${port}`));
