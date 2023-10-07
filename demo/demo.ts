import { WebRTCPlayer, ListAvailableAdapters } from '../src/index';

interface PacketsLost {
  [type: string]: number;
}

const BROADCASTER_URL =
  process.env.BROADCASTER_URL ||
  'https://broadcaster.lab.sto.eyevinn.technology:8443/broadcaster';
const WHEP_URL =
  process.env.WHEP_URL ||
  'https://srtwhep.lab.sto.eyevinn.technology:8443/channel';

async function getChannels(broadcasterUrl: string) {
  const response = await fetch(broadcasterUrl + '/channel');
  if (response.ok) {
    const channels = await response.json();
    return channels;
  }
  return [];
}

let clientTimeMsElement: HTMLSpanElement | null;

function pad(v: number, n: number) {
  let r;
  for (r = v.toString(); r.length < n; r = 0 + r);
  return r;
}

function updateClientClock() {
  const now = new Date();
  const [h, m, s, ms] = [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ];
  const ts = `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
  if (clientTimeMsElement) {
    clientTimeMsElement.innerHTML = ts;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const input = document.querySelector<HTMLInputElement>('#channelUrl');
  const video = document.querySelector('video');
  const inputContainer = document.querySelector<HTMLDivElement>('#input');
  const adapterContainer = document.querySelector<HTMLDivElement>('#adapters');
  const inputPrerollUrl =
    document.querySelector<HTMLInputElement>('#prerollUrl');

  if (!input || !inputContainer || !adapterContainer || !inputPrerollUrl) {
    return;
  }

  const searchParams = new URL(window.location.href).searchParams;
  const type = searchParams.get('type') || 'whep';

  if (type === 'se.eyevinn.whpp' || type === 'se.eyevinn.webrtc') {
    const channels = await getChannels(BROADCASTER_URL);
    if (channels.length > 0) {
      input.value = channels[0].resource;
    }
    inputContainer.style.display = 'block';
  } else {
    if (type === 'whep') {
      input.value = WHEP_URL;
    }
    inputContainer.style.display = 'block';
  }

  ListAvailableAdapters().forEach((adapterType) => {
    const btn = document.createElement('button');
    btn.textContent = adapterType;
    btn.onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('type', adapterType);
      window.open(url, '_self');
    };
    adapterContainer.appendChild(btn);
  });

  let iceServers: RTCIceServer[];

  if (process.env.ICE_SERVERS) {
    iceServers = [];
    process.env.ICE_SERVERS.split(',').forEach((server) => {
      // turn:<username>:<password>@turn.eyevinn.technology:3478
      const m = server.match(/^turn:(\S+):(\S+)@(\S+):(\d+)/);
      if (m) {
        const [_, username, credential, host, port] = m;
        iceServers.push({
          urls: 'turn:' + host + ':' + port,
          username: username,
          credential: credential
        });
      }
    });
  }

  let player: WebRTCPlayer;

  const playButton = document.querySelector<HTMLButtonElement>('#play');
  playButton?.addEventListener('click', async () => {
    // const channelUrl = input.value;
    const channelUrl = "https://edge02.lab39.stream/blackjack/whap";
    const vmapUrlElem = document.querySelector<HTMLInputElement>('#preroll');
    const vmapUrl =
      vmapUrlElem && vmapUrlElem.checked ? inputPrerollUrl.value : undefined;
    if (video) {
      player = new WebRTCPlayer({
        video: video,
        type: type,
        iceServers: iceServers,
        debug: true,
        vmapUrl: vmapUrl,
        statsTypeFilter: '^candidate-*|^inbound-rtp'
      });
    }

    const packetsLost: PacketsLost = { video: 0, audio: 0 };

    player.on('stats:candidate-pair', (report) => {
      const currentRTTElem =
        document.querySelector<HTMLSpanElement>('#stats-current-rtt');
      const incomingBitrateElem = document.querySelector<HTMLSpanElement>(
        '#stats-incoming-bitrate'
      );
      if (report.nominated && currentRTTElem) {
        currentRTTElem.innerHTML = `RTT: ${
          report.currentRoundTripTime * 1000
        }ms`;
        if (report.availableIncomingBitrate && incomingBitrateElem) {
          incomingBitrateElem.innerHTML = `Bitrate: ${Math.round(
            report.availableIncomingBitrate / 1000
          )}kbps`;
        }
      }
    });
    player.on('stats:inbound-rtp', (report) => {
      if (report.kind === 'video' || report.kind === 'audio') {
        const packetLossElem =
          document.querySelector<HTMLSpanElement>('#stats-packetloss');
        packetsLost[report.kind] = report.packetsLost;
        if (packetLossElem) {
          packetLossElem.innerHTML = `Packets Lost: A=${packetsLost.audio},V=${packetsLost.video}`;
        }
      }
    });

    await player.load(new URL(channelUrl));
  });

  const stopButton = document.querySelector<HTMLButtonElement>('#stop');
  stopButton?.addEventListener('click', async () => {
    await player.unload();
  });

  clientTimeMsElement = document.querySelector<HTMLSpanElement>('#localTimeMs');
  window.setInterval(updateClientClock, 1);
});
