const querystring = require('querystring');
const request = require('request');
const {createReadStream} = require("fs");
const {Transform} = require("stream");
const {generateTracing} = require("../../utils");
const API_TOKEN = process.env.API_TOKEN;  // see https://app.deeptranscript.com/account/members

if (!API_TOKEN) {
    throw new Error(`API_TOKEN required`);
}

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const dataFormat = "wav";
const sampleRate = 8000;
const fileName = `${__dirname}/../../_files/count.wav`;

// Split file in small parts and send them with the
// right delay to simulate live-streaming
const audioStream = createReadStream(fileName)
    .pipe(new Transform({
        transform(chunk, encoding, done) {
            "transform input stream into chunks of XXms"
            if (!this.chunkSize) {
                const frameDuration = 100;
                this.chunkSize = frameDuration * sampleRate / 1000 * 2;
                this.buffer = Buffer.alloc(0); // local buffer
            }
            if (this.buffer.length) {
                chunk = Buffer.concat([this.buffer, chunk]);
                this.buffer = Buffer.alloc(0);
            }
            while (chunk.length >= this.chunkSize) {
                this.push(chunk.slice(0, this.chunkSize));
                chunk = chunk.slice(this.chunkSize);
            }
            if (chunk.length) {
                this.buffer = chunk.slice(0); // copy
            }
            done();
        },
    }))
    .pipe(new Transform({
        transform(chunk, encoding, callback) {
            "send chunks of XXms with the right delay to simulate live-streaming"
            setTimeout(
                () => {
                    this.push(chunk);
                    callback();
                },
                ((chunk.length * 1000) / (sampleRate * 2) - 1),
            );
        },
    }));

// This will be use as reference for tracing generation
const refTime = new Date().valueOf();
let start = refTime;

const qs = querystring.stringify({
    language: process.env.LANGUAGE || 'en',
    sampleRate: sampleRate,  // WARN: must match mic configuration
    dataFormat: dataFormat,   // WARN: must match mic configuration
    // expectedPhrases: ['Deeptranscript rocks!'],
    localizeWords: 1,
})
const uri = `https://stream.deeptranscript.com/?${qs}`
audioStream.pipe(request({
    method: "POST",
    uri: uri,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
    },
}, (err, res, data) => {
    if (err) {
        console.error(err)
    } else {
        data = JSON.parse(data);
        console.log(data)
        const tracing = { apiEvents: [{ ...data, speeches: [data], status: "done", timestamp: new Date().valueOf() }] };
        const took = new Date().valueOf() - start;
        const audacityFname = generateTracing(refTime, "/tmp", { path: fileName, sampleRate, channel: 0, format: dataFormat }, tracing);
        console.log(`client latency was ${Math.round(took)}ms, see "$ audacity ${audacityFname}"`)
    }
    process.exit(err ? 1: 0);
}));

audioStream.once("end", () => {
    console.log('audio stream ended => waiting up to 10s for server response…')
    setTimeout(() => process.exit(1), 10000);
    start = new Date().valueOf();  // start counting on mic end
});

function stopStream() {
    audioStream.end();
    readline.close();
}

readline.question('wav file is being piped in real-time. Press enter or ctrl+C to terminate…', () => stopStream());
process.on('SIGTERM', stopStream);
process.on('SIGINT', stopStream);
