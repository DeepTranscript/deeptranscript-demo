![database structure](./docs/logo.png)

[DeepTranscript](https://www.deeptranscript.com) provides state-of-the-art speech-to-text accuracy in both english and french languages.
In this repository you will see how simple it is to integrate to [DeepTranscript High Availability API](https://app.deeptranscript.com/documentation).

We will also use:
 - [python flask](https://flask.palletsprojects.com/en/2.0.x/) to start an HTTP server on your machine (listening on port 5000).
 - [ngrok](https://ngrok.com/) to make your local server available from the outside
 - [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://www.ffmpeg.org/) to show you how to extract audio from a video file or from a youtube video
 

## Before we begin
 - Here is how [DeepTranscript API](https://app.deeptranscript.com/documentation) works
   ![Integration workflow](./docs/api-overview.jpg)
 - Make sure you [signed up](https://app.deeptranscript.com/signup) and get your 20h evaluation welcome bonus
 - Retrieve your API Token from [members configuration](https://app.deeptranscript.com/account/members)


## Requirements
 - python 3.6+

## Setup (debian or ubuntu)
```shell
$ sudo apt install ffmpeg curl git python3-venv unzip flac
$ git clone git@github.com:DeepTranscript/deeptranscript-demo.git deeptranscript-demo 
$ cd deeptranscript-demo
# setup virtualenv
$ python3 -m venv ./venv
$ source ./venv/bin/activate
$ (venv) python --version  # make sure it is 3.6+
$ (venv) pip install -U pip
$ (venv) pip install flask yt-dlp requests

# setup ngrok
$ curl https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-stable-linux-amd64.zip --output ./ngrok.zip \
  && unzip ./ngrok.zip \
  && rm ./ngrok.zip \
  && chmod +x ngrok
```

Now that everything is installed you can start the flask server on a new shell `shell#1`. 
This server will listen on port 5000 and expose 2 endpoints (see [./server.py](./server.py) for more info):
 - `http://localhost:5000/callback`, expecting POST requests and printing requests headers and bodies
 - `http://localhost:5000/files`, expecting GET requests and serving local files located in [./files](./files) folder
```shell
$ cd ./path/to/deeptranscript-demo
$ source ./venv/bin/activate
$ (venv) python server.py
```

Now start ngrok on another shell `shell#2` to make the flask server available from Internet
```shell
# open a new shell and start ngrok
$ cd ./path/to/deeptranscript-demo
$ ./ngrok http 5000 --region eu
```

finally, open a third shell (which will be the main shell from now on) and set `NGROK_URL` and `API_TOKEN` environment variables as described below
```shell
$ cd ./path/to/deeptranscript-demo
$ export NGROK_URL=<public-url-from-ngrok>  # keep track of ngrok https URL from shell#2
$ export API_TOKEN=<your-api-token-from-deeptranscript-console> # see https://app.deeptranscript.com/account/members
``` 

## Create a new transcription request
We will now see how to ask DeepTranscript's API to transcribe [./files/w3jLJU7DT5E_mono_.mp3](./files/w3jLJU7DT5E_mono.mp3) file. 

NOTE: This file is given for simplicity and has been extracted from [youtube](https://www.youtube.com/watch?v=w3jLJU7DT5E&ab_channel=GitHub) using [the commands described below](#extra)

NOTE: we use `curl` here but, since it just an ordinary HTTP request, you can use any language/framework you want…

```shell
$ curl https://app.deeptranscript.com/api/transcriptions/ \
  --request POST \
  --header "Authorization: Bearer ${API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{"recording":"'$NGROK_URL'/files/w3jLJU7DT5E_mono.mp3","recordingFormat":"mp3","callbackUrl":"'$NGROK_URL'/callback","language":"en"}' 
```

As you can see, the response indicates `state="pending"`. This is because DeepTranscript API works asynchronously (as described below).
![Integration workflow](./docs/api-overview.jpg)

If you take a look to `shell#1`, you should have received transcription information by now…

**Congrats !!! you now have all the information you need to integrate the world’s best machine transcription technology directly into your own products and platforms**

## Troubleshooting

If anything goes wrong you will find all the information you need on [DeepTranscript Console](https://app.deeptranscript.com)


## Extra

Here is how-to extract the audio recording from a Youtube video using [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://www.ffmpeg.org/):
```shell
$ cd ./path/to/deeptranscript-demo
$ source ./venv/bin/activate
$ cd ./files
$ export YOUTUBE_ID=<the-id-of-the-video>  # ex: w3jLJU7DT5E
$ yt-dlp https://www.youtube.com/watch?v=$YOUTUBE_ID --id --extract-audio --audio-format flac --prefer-ffmpeg
# IMPORTANT: we fetch left channel only since it is the same as right channel. If you send stereo files to DeepTranscript API it will transcribe each channel independently
$ ffmpeg -y -i ${YOUTUBE_ID}.flac -map_channel 0.0.0 ./${YOUTUBE_ID}_mono.flac
$ echo "local url: http://localhost:5000/files/${YOUTUBE_ID}_mono.flac"
$ echo "public url: ${NGROK_URL}/files/${YOUTUBE_ID}_mono.flac"
```
