const mic = require('mic'); // requires arecord or sox, see https://www.npmjs.com/package/mic
const querystring = require('querystring');
const request = require('request');
const API_TOKEN = process.env.API_TOKEN;  // see https://app.deeptranscript.com/account/members

if (!API_TOKEN) {
    throw new Error(`API_TOKEN required`);
}

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const sampleRate = 8000;
const micInstance = mic({
    rate: sampleRate.toString(),
    channels: '1',
    device: 'plughw:0,0',  // see $ arecord --list-devices
    debug: true,
});

const micStream = micInstance.getAudioStream();
micInstance.start();

const qs = querystring.stringify({
    language: process.env.LANGUAGE || 'en',
    sampleRate: sampleRate,  // WARN: must match mic configuration
    dataFormat: 's16le',   // WARN: must match mic configuration
    // expectedPhrases: ['Deeptranscript rocks!'],
    localizeWords: 1,
})
const uri = `https://stream.deeptranscript.com/?${qs}`
micStream.pipe(request({
    method: "POST",
    uri: uri,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
    },
}, (err, res, data) => {
    if (err) console.error(err)
    console.log(data)
    const took = new Date().valueOf() - start;
    console.log(`client latency was ${Math.round(took)}ms`)
    process.exit(err ? 1: 0);
}));

let start;

function stopMicrophone() {
    console.log('waiting up to 10s for server response…')
    setTimeout(() => process.exit(1), 10000);
    micInstance.stop();
    readline.close();
    start = new Date().valueOf();  // start counting on mic end
}

readline.question('Microphone listening. Press enter or ctrl+C once you are done speaking…', () => stopMicrophone());
process.on('SIGTERM', stopMicrophone);
process.on('SIGINT', stopMicrophone);
