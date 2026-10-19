// aurora-field/react: <AuroraStage> plays a storyboard in React.
//   <AuroraStage src="/api/scene?vertical=roofers" fallback={board} live={60} focus={trade} />
// The storyboard can come inline (storyboard), from a URL (src, with ETag polling every `live`
// seconds while the page is visible), or both: the inline or fallback board plays at once and the
// fetched one takes over at the next beat. The stage itself loads after first paint.
import { createElement as h, useEffect, useRef } from 'react';
import AuroraField from 'aurora-field';

export function AuroraStage({ storyboard, src, fallback, focus = null, live = 0, timeout = 1500, options, className, style, onBeat, onPhase, onError, onLoad }) {
  const box = useRef(null), canvas = useRef(null), stage = useRef(null), etag = useRef(null), cbs = useRef({});
  cbs.current = { onBeat, onPhase, onError, onLoad };

  useEffect(() => {
    let dead = false, timer = 0;
    const fail = (e) => cbs.current.onError && cbs.current.onError(e);
    const start = (board) => {
      if (dead || !board) return;
      if (stage.current) { const v = stage.current.load(board); if (!v.ok) fail(new Error(v.errors.join('; '))); else cbs.current.onLoad && cbs.current.onLoad(board); return; }
      try {
        stage.current = AuroraField.stage(canvas.current, board, { container: box.current, ...options });
        stage.current.on('beat', (b) => cbs.current.onBeat && cbs.current.onBeat(b));
        stage.current.on('phase', (p) => cbs.current.onPhase && cbs.current.onPhase(p));
        cbs.current.onLoad && cbs.current.onLoad(board);
      } catch (e) { fail(e); }
    };
    const pull = async (first) => {
      if (!src || dead) return;
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = first ? setTimeout(() => ctl && ctl.abort(), timeout) : 0;
      try {
        const res = await fetch(src, { headers: etag.current ? { 'If-None-Match': etag.current } : {}, signal: ctl ? ctl.signal : undefined });
        clearTimeout(t);
        if (res.status === 304) return;
        if (!res.ok) throw new Error('storyboard ' + res.status);
        etag.current = res.headers.get('ETag');
        start(await res.json());
      } catch (e) { clearTimeout(t); if (first && !stage.current) start(fallback); fail(e); }
    };
    // play what we have now (inline or fallback) unless a src is expected to answer quickly
    if (storyboard) start(storyboard); else if (!src && fallback) start(fallback);
    pull(true);
    if (live > 0) timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) pull(false); }, live * 1000);
    return () => { dead = true; clearInterval(timer); if (stage.current) stage.current.destroy(); stage.current = null; };
    // the stage is built once per src; a new inline storyboard is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => { if (storyboard && stage.current) stage.current.load(storyboard); }, [storyboard]);
  useEffect(() => { if (stage.current) stage.current.focus(focus); }, [focus]);

  return h('div', { ref: box, className, style: { position: 'relative', ...style } },
    h('canvas', { ref: canvas, 'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' } }));
}
export default AuroraStage;
