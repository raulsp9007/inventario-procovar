// Aviso sonoro corto y suave (dos notas) cuando llega un pedido nuevo. Sin archivos de audio.
// Si el navegador no tiene audio o lo bloquea, no pasa nada.
let context = null;

export function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!context) context = new AudioCtx();
    if (context.state === "suspended" && context.resume) context.resume();
    const now = context.currentTime;
    [[880, 0], [1175, 0.18]].forEach(([frequency, delay]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.3);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.32);
    });
  } catch {
    // Sin audio: se sigue sin sonido.
  }
}
