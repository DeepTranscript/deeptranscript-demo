const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { last, isNull } = require('lodash');
const { mkdirSync, writeFileSync } = require('fs');
const { execSync } = require('child_process');

function roundMs(value) {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
exports.roundMs = roundMs;

function createAudacity(outputDir, fileName, channel, preTracks = [], postTracks = []) {
    fs.mkdirSync(`${outputDir}/audacity_data`, { recursive: true });
    execSync(`ffmpeg -y -loglevel quiet -i ${fileName} -map_channel 0.0.${channel} ${outputDir}/audacity_data/${path.basename(fileName)}_channel.wav`);
    const getLabel = (l) => `<label t="${l.start}" t1="${l.end}" title="${l.text}"/>`;
    const getTrack = (t) => `
        <labeltrack name="${t.trackName}" numlabels="${t.labels.length}" height="73" minimized="0" isSelected="0">
        ${t.labels.map(getLabel).join('\n')}
        </labeltrack>`;
    const preTracksString = preTracks.map(getTrack);
    const postTracksString = postTracks.map(getTrack);
    console.log(`writing audacity file at ${outputDir}/audacity.aup`);
    fs.writeFileSync(`${outputDir}/audacity.aup`, `<?xml version="1.0" standalone="no" ?>
              <!DOCTYPE project PUBLIC "-//audacityproject-1.3.0//DTD//EN" "http://audacity.sourceforge.net/xml/audacityproject-1.3.0.dtd" >
              <project xmlns="http://audacity.sourceforge.net/xml/" projname="{source_name}_data" version="1.3.0" audacityversion="2.2.1" sel0="0.0000000000" sel1="0.0000000000" vpos="0" h="0.0000000000" zoom="1" rate="16000.0" snapto="off" selectionformat="seconds" frequencyformat="Hz" bandwidthformat="octaves">
                     <tags>
                             <tag name="Software" value="Lavf57.83.100"/>
                             <tag name="Copyright" value="callity.fr"/>
                             <tag name="TITLE" value="${path.basename(fileName)}:${channel}"/>
                             <tag name="COMMENTS" value=""/>
                     </tags>
                     ${preTracksString}
                     <import filename="${path.basename(fileName)}_channel.wav" offset="0.00000000" mute="0" solo="0" height="150" minimized="0" gain="1.0" pan="0.0"/>
                     ${postTracksString}
              </project>
    `);
}
exports.createAudacity = createAudacity;

function generateTracing(refTime, outputDir, source = {}, tracing = {}) {
    if (!tracing.hasOwnProperty('apiEvents') || !tracing.hasOwnProperty('clientBytesEvents')) {
        console.error('Can not generate audacity file missing objects');
        return;
    }

    const lastEvent = last(tracing.apiEvents);
    mkdirSync(`${outputDir}/deeptranscript-${lastEvent.uid}`);
    // Write all events on disk.
    writeFileSync(`${outputDir}/deeptranscript-${lastEvent.uid}/tracing.apiEvents.json`, JSON.stringify(tracing.apiEvents), { encoding: 'utf-8' });
    writeFileSync(`${outputDir}/deeptranscript-${lastEvent.uid}/tracing.clientsBytesEvents.json`, JSON.stringify(tracing.clientBytesEvents), { encoding: 'utf-8' });

    const fileOutputName = `${outputDir}/deeptranscript-${lastEvent.uid}/${lastEvent.uid}.wav`;
    if (source.hasOwnProperty('path')) {
        execSync(`ffmpeg -y -loglevel quiet -f ${source.format} -sample_rate ${source.sampleRate} -i ${source.path} -map_channel 0.0.${source.channel} ${fileOutputName}`);
    } else {
    // We assume it's from mic
        const micFileName = `${outputDir}/deeptranscript-${lastEvent.uid}/mic.pcm`;
        writeFileSync(micFileName, source.data, { encoding: 'binary' });
        execSync(`ffmpeg -y -loglevel quiet -f s16le -sample_rate ${source.sampleRate} -i ${micFileName} -map_channel 0.0.${source.channel} ${fileOutputName}`);
    }

    createAudacity(
        `${outputDir}/deeptranscript-${lastEvent.uid}`,
        fileOutputName,
        0,
        [
            {
                trackName: 'speeches',
                labels: tracing.apiEvents.map((event) => ({ ...last(event.speeches), event }))
                    .map((speech, i) => ({
                        start: speech.start,
                        end: isNull(speech.end) ? speech.event.audioDuration : speech.end,
                        text: `#${i}:${speech.status ? speech.status : 'empty'}:${speech.text ? speech.text : 'empty'}`,
                    })),
            },
            {
                trackName: 'words',
                labels: lastEvent.speeches
                    .reduce((m, s) => m.concat(s.words), [])
                    .map((word, i) => ({
                        start: word.start,
                        end: word.end,
                        text: `text:${word.text}`,
                    })),
            },
        ],
        [
            {
                trackName: 'apiStatus',
                labels: tracing.apiEvents.map((event, i) => ({
                    start: roundMs((event.timestamp - refTime) / 1000),
                    end: roundMs((event.timestamp - refTime) / 1000),
                    text: `#${i}:${event.status}`,
                })),
            },
            {
                trackName: 'feedback',
                labels: tracing.apiEvents.filter((e, i) => e.status === 'waiting').map((event, i) => ({
                    start: last(event.speeches).end,
                    end: roundMs((event.timestamp - refTime) / 1000),
                    text: `#${i}:gracePeriod ${roundMs(((event.timestamp - refTime)) - last(event.speeches).end * 1000)}ms`,
                })),
            },
            {
                trackName: 'socketBytesSend',
                labels: tracing.clientBytesEvents.map((event, i) => ({
                    start: roundMs(event.start / 1000),
                    end: roundMs(event.end / 1000),
                    text: `#${i}:${event.message} in ${roundMs(event.end - event.start)}ms`,
                })),
            },
        ],
    );
}
exports.generateTracing = generateTracing;

class realtimeAudioStream extends stream.Transform {
    // cut input stream into fixed sized chunks
    constructor(frameDuration = 30) {
        super({
            flush: (callback) => {
                callback();
            },
            transform: (chunk, encoding, done) => {
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
        });
        this.chunkSize = frameDuration * 8 * 2;
        this.buffer = Buffer.alloc(0); // local buffer
    }
}
exports.realtimeAudioStream = realtimeAudioStream;
