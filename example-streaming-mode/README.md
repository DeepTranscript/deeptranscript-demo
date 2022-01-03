[DeepTranscript STREAMING API](https://app.deeptranscript.com/documentation#operation/transcriptions_stream) is especially useful for VoiceBot or CallBot-like applications where response time and high availability are critical.

With Streaming API, you can expect less than 200 ms response time on average for audio stream from 0 to 60 secs.


## Before you begin
 - Make sure you [signed up](https://app.deeptranscript.com/signup) and get your 20h evaluation welcome bonus
 - Retrieve your API Token from [members configuration](https://app.deeptranscript.com/account/members)


## Requirements
 - nodejs v10+

## Nodejs example

```shell script
$ cd ./path/to/deeptranscript-demo/example-streaming-mode
$ npm install
$ export API_TOKEN=<your-api-token-from-deeptranscript-console>  # see https://app.deeptranscript.com/account/members
$ LANGUAGE=en node ./pipe-microphone.js
```

see [./pipe-microphone.js](./pipe-microphone.js) for more information
