/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

const fs = require('fs');
const path = require('path');
const { last, isEmpty } = require('lodash');
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
        <labeltrack name="${t.trackName}" numlabels="${t.labels.length}" height="${t.height || 73}" minimized="0" isSelected="0">
        ${t.labels.map(getLabel).join('\n')}
        </labeltrack>`;

  const preTracksString = preTracks.map(getTrack);
  const postTracksString = postTracks.map(getTrack);
  // console.log(`writing audacity file at ${outputDir}/audacity.aup`);
  fs.writeFileSync(`${outputDir}/audacity.aup`, `<?xml version="1.0" standalone="no" ?>

              <!DOCTYPE project PUBLIC "-//audacityproject-1.3.0//DTD//EN" "http://audacity.sourceforge.net/xml/audacityproject-1.3.0.dtd" >
              <project xmlns="http://audacity.sourceforge.net/xml/" projname="{source_name}_data" version="1.3.0" audacityversion="2.2.1" sel0="0.0000000000" sel1="0.0000000000" vpos="0" h="0.0000000000" zoom="150" rate="16000.0" snapto="off" selectionformat="seconds" frequencyformat="Hz" bandwidthformat="octaves">
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
  const lastEvent = last(tracing.apiEvents);
  mkdirSync(`${outputDir}/deeptranscript-${lastEvent.uid}`);
  // Write all events on disk.
  writeFileSync(`${outputDir}/deeptranscript-${lastEvent.uid}/tracing.apiEvents.json`, JSON.stringify(tracing.apiEvents), { encoding: 'utf-8' });

  const fileOutputName = `${outputDir}/deeptranscript-${lastEvent.uid}/${lastEvent.uid}.wav`;
  if (source.path) {
    execSync(`ffmpeg -y -loglevel quiet -f ${source.format === 'wav' ? 's16le' : source.format} -sample_rate ${source.sampleRate} -i ${source.path} -map_channel 0.0.${source.channel} ${fileOutputName}`);
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
        trackName: 'words',
        labels: lastEvent.speeches
          .reduce((m, s) => m.concat(s.words), [])
          .map((word, _i) => ({
            start: word.start,
            end: word.end,
            text: `text:${word.text}`,
          })),
      },
    ],
    [
      {
        trackName: 'status',
        height: 50,
        labels: tracing.apiEvents.reduce(
          (memo, event, _i) => {
            const currentState = memo[memo.length - 1];

            if (event.status === currentState.text) {
              return memo;
            }
            const currentLocationSeconds = roundMs((event.timestamp - refTime) / 1000);
            currentState.end = currentLocationSeconds;
            memo.push({
              start: currentLocationSeconds,
              end: currentLocationSeconds,
              text: event.status,
            });
            return memo;
          },
          [{ start: 0, text: 'transcribing', end: null }],
        ),
      },
      {
        trackName: 'speeches',
        height: 300,
        labels: tracing.apiEvents.filter((e) => e.speeches && e.speeches.length && e.text !== null)
          .reduce((memo, event, i, all) => {
            const prevEvent = all[i - 1];
            const speech = last(event.speeches);
            const lastWord = last(speech.words);
            // eslint-disable-next-line max-len
            const speechEnd = lastWord && !isEmpty(lastWord.text) ? lastWord.end : event.audioDuration;
            if (prevEvent && prevEvent.status === 'waiting' && event.status === 'done') {
              return memo;
            }
            if (prevEvent && prevEvent.status === 'waiting' && event.status === 'transcribing') {
              memo.push({
                start: roundMs((event.timestamp - refTime) / 1000),
                end: roundMs((event.timestamp - refTime) / 1000),
                text: `#${i}:restart`,
              });
            } else {
              memo.push({
                start: speech.start,
                end: speechEnd,
                text: `#${i}:audio:${isEmpty(speech.text) ? 'empty' : speech.text}`,
              });
              memo.push({
                start: speechEnd,
                end: roundMs((event.timestamp - refTime) / 1000),
                text: `#${i}:latency:${Math.round(((event.timestamp - refTime) / 1000 - speechEnd) * 1000)}ms`,
              });
            }
            return memo;
          }, []),
      },
    ],
  );

  return `${outputDir}/deeptranscript-${lastEvent.uid}/audacity.aup`;
}
exports.generateTracing = generateTracing;
