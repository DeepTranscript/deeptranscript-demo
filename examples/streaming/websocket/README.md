[DeepTranscript WEBSOCKET STREAMING API](https://app.deeptranscript.com/documentation#operation/transcriptions_ws_stream) is especially useful for VoiceBot or CallBot-like applications where response time and high availability are critical.

With WEBSOCKET Streaming API, you can process input streams of any size and get intermediate results indicating if user is speaking and what is being said in almost realtime

**Here is how it works:**

![Integration workflow](../../../docs/ws-streaming-api-overview.jpg)

## Before you begin
 - Make sure you [signed up](https://app.deeptranscript.com/signup) and get your 20h evaluation welcome bonus
 - Retrieve your API Token from [members configuration](https://app.deeptranscript.com/account/members)
 - Make sure all [dependencies are installed](/#setup-debian-or-ubuntu)

## Nodejs example

```shell script
$ cd ./path/to/deeptranscript-demo/
$ npm install
$ export API_TOKEN=<your-api-token-from-deeptranscript-console>  # see https://app.deeptranscript.com/account/members
$ LANGUAGE=en node ./examples/streaming/websocket/pipe-microphone.js
```

see [./pipe-microphone.js](./pipe-microphone.js) for more information
