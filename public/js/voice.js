// Голосовой чат через WebRTC. Сигналинг идёт через игровой WebSocket ('rtc').
// Включается клавишей V; работает, только если оба игрока включили микрофон.

export class VoiceChat {
  constructor(net, mySlot) {
    this.net = net;
    this.mySlot = mySlot;
    this.pc = null;
    this.stream = null;
    this.enabled = false;
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
    this.peerReady = false;

    net.on('rtc', (m) => this._onSignal(m.data));
  }

  async toggle() {
    if (this.enabled) {
      this._stop();
      this.net.send({ t: 'rtc', data: { kind: 'voice-off' } });
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return false; // микрофон не дали
    }
    this.enabled = true;
    this.net.send({ t: 'rtc', data: { kind: 'voice-on' } });
    if (this.peerReady) this._connect();
    return true;
  }

  _stop() {
    this.enabled = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.pc) { this.pc.close(); this.pc = null; }
  }

  _newPC() {
    if (this.pc) this.pc.close();
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.net.send({ t: 'rtc', data: { kind: 'ice', candidate: e.candidate } });
    };
    this.pc.ontrack = (e) => {
      this.remoteAudio.srcObject = e.streams[0];
      this.remoteAudio.play().catch(() => {});
    };
    if (this.stream) {
      for (const track of this.stream.getTracks()) this.pc.addTrack(track, this.stream);
    }
  }

  async _connect() {
    // оффер делает хост (slot 0), чтобы не столкнуться лбами
    if (this.mySlot !== 0) return;
    this._newPC();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.net.send({ t: 'rtc', data: { kind: 'offer', sdp: offer } });
  }

  async _onSignal(d) {
    try {
      if (d.kind === 'voice-on') {
        this.peerReady = true;
        if (this.enabled) this._connect();
      } else if (d.kind === 'voice-off') {
        this.peerReady = false;
        if (this.pc) { this.pc.close(); this.pc = null; }
      } else if (d.kind === 'offer') {
        if (!this.enabled) return;
        this._newPC();
        await this.pc.setRemoteDescription(d.sdp);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.net.send({ t: 'rtc', data: { kind: 'answer', sdp: answer } });
      } else if (d.kind === 'answer') {
        if (this.pc) await this.pc.setRemoteDescription(d.sdp);
      } else if (d.kind === 'ice') {
        if (this.pc) await this.pc.addIceCandidate(d.candidate);
      }
    } catch (err) {
      console.warn('Голосовой чат:', err);
    }
  }
}
