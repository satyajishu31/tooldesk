import React, { useEffect, useRef, useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Cross-browser rounded rect polyfill (does NOT call beginPath - caller must do it)
function rrPath(c, x, y, w, h, r) {
  const R = Math.min(r, w/2, h/2)
  c.moveTo(x+R, y)
  c.lineTo(x+w-R, y); c.quadraticCurveTo(x+w, y, x+w, y+R)
  c.lineTo(x+w, y+h-R); c.quadraticCurveTo(x+w, y+h, x+w-R, y+h)
  c.lineTo(x+R, y+h); c.quadraticCurveTo(x, y+h, x, y+h-R)
  c.lineTo(x, y+R); c.quadraticCurveTo(x, y, x+R, y)
  c.closePath()
}
function rr(c, x, y, w, h, r) { c.beginPath(); rrPath(c, x, y, w, h, r) }


function AnimBox({ children, bg='#F5F7FF', minH=200 }) {
  return (
    <div style={{ borderRadius:16,overflow:'hidden',minHeight:minH,background:bg,
      display:'flex',alignItems:'center',justifyContent:'center',
      padding:'18px 14px',position:'relative',width:'100%',
      contain:'layout style',
      transform:'translateZ(0)', backfaceVisibility:'hidden',
      willChange:'auto' }}>
      {children}
    </div>
  )
}

/* 1. PASSWORD */
const PassAnim = memo(()=>{
  const C='ABCDEFabcdef!@#$0123456789%^&*'
  const [chars,setChars]=useState(()=>Array(12).fill('•'))
  const [locked,setLocked]=useState(false),[str,setStr]=useState(72)
  useEffect(()=>{
    let si;const go=()=>{setLocked(false);si=setInterval(()=>{setChars(Array.from({length:12},()=>C[Math.floor(Math.random()*C.length)]));setStr(60+Math.floor(Math.random()*32))},140)}
    go();const li=setInterval(()=>{clearInterval(si);setLocked(true);setStr(97);setTimeout(go,1400)},2200)
    return()=>{clearInterval(si);clearInterval(li)}
  },[])
  const col=str>85?'#22c55e':str>65?'#4F8EF7':'#f59e0b'
  return <AnimBox bg="linear-gradient(135deg,#fdf4ff,#f0f4ff)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:13,width:'100%'}}>
      <motion.div animate={{scale:locked?[1,1.2,1]:1}} transition={{duration:.4}} style={{fontSize:48,filter:locked?`drop-shadow(0 0 16px ${col}90)`:'none',transition:'filter .3s'}}>{locked?'🔐':'🔓'}</motion.div>
      <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'center',maxWidth:230}}>
        {chars.map((ch,i)=><motion.span key={i} animate={{opacity:[0,1],y:[-4,0]}} transition={{duration:.1,delay:i*.01}} style={{display:'inline-block',width:16,textAlign:'center',fontFamily:'monospace',fontSize:13,fontWeight:700,color:locked?'#22c55e':'#9C6FDE',background:locked?'rgba(34,197,94,.1)':'rgba(156,111,222,.08)',borderRadius:4,padding:'2px 0',transition:'color .25s,background .25s'}}>{ch}</motion.span>)}
      </div>
      <div style={{width:200}}>
        <div style={{height:4,background:'#e5e7ef',borderRadius:2,overflow:'hidden',marginBottom:4}}><motion.div animate={{width:`${str}%`,backgroundColor:col}} transition={{duration:.5}} style={{height:'100%',borderRadius:2}}/></div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,fontWeight:700}}><span style={{color:'#ccc'}}>~{Math.round(str*1.28)} bits</span><span style={{color:col}}>{str>85?'Very Strong':str>65?'Strong':'Medium'}</span></div>
      </div>
    </div>
  </AnimBox>
})

/* 2. WORD COUNT */
const WordAnim = memo(()=>{
  const W=['design','ship','build','code','create','launch','write','edit']
  const [fl,setFl]=useState([]);const [cnt,setCnt]=useState(0);const id=useRef(0)
  useEffect(()=>{const t=setInterval(()=>{const n=++id.current;setFl(f=>[...f.slice(-5),{id:n,word:W[n%W.length],x:8+Math.random()*66,hue:210+Math.random()*60}]);setCnt(c=>c+1)},370);return()=>clearInterval(t)},[])
  return <AnimBox bg="linear-gradient(135deg,#f0f4ff,#f7f0ff)" minH={200}>
    <div style={{position:'relative',width:'100%',height:160,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <AnimatePresence>{fl.map(f=><motion.span key={f.id} initial={{opacity:0,y:70,x:`${f.x}%`,scale:.7}} animate={{opacity:[0,1,.9,0],y:[70,30,0,-35]}} transition={{duration:2.4,ease:'easeOut'}} style={{position:'absolute',fontSize:11+Math.random()*7,fontWeight:600,color:`hsl(${f.hue},62%,46%)`,background:`hsla(${f.hue},65%,96%,.9)`,padding:'3px 9px',borderRadius:999,whiteSpace:'nowrap'}}>{f.word}</motion.span>)}</AnimatePresence>
      <div style={{zIndex:2,background:'rgba(255,255,255,.92)',padding:'11px 24px',borderRadius:16,backdropFilter:'blur(12px)',border:'1px solid rgba(79,142,247,.15)',textAlign:'center'}}>
        <motion.div key={cnt} animate={{scale:[1.14,1]}} transition={{duration:.18}} style={{fontFamily:'Syne,sans-serif',fontSize:40,fontWeight:800,color:'#4F8EF7',lineHeight:1}}>{cnt}</motion.div>
        <div style={{fontSize:9.5,color:'#aaa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',marginTop:3}}>Words</div>
      </div>
    </div>
  </AnimBox>
})

/* 3. TEXT CASE */
const TCaseAnim = memo(()=>{
  const S=[{l:'UPPERCASE',t:'TOOLDESK',c:'#4F8EF7'},{l:'lowercase',t:'tooldesk',c:'#9C6FDE'},{l:'camelCase',t:'toolDesk',c:'#F06292'},{l:'snake_case',t:'tool_desk',c:'#FF9800'},{l:'kebab-case',t:'tool-desk',c:'#4CAF50'},{l:'PascalCase',t:'ToolDesk',c:'#FF5722'}]
  const [i,setI]=useState(0);const [v,setV]=useState(true)
  useEffect(()=>{const t=setInterval(()=>{setV(false);setTimeout(()=>{setI(x=>(x+1)%S.length);setV(true)},280)},1300);return()=>clearInterval(t)},[])
  const {l,t,c}=S[i]
  return <AnimBox bg="linear-gradient(135deg,#f8f0ff,#f0f4ff)" minH={200}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:13}}>
      <div style={{display:'flex',gap:2}}>{['A','a'].map((ch,k)=><motion.span key={k} animate={{y:[0,-9,0],scale:[1,1.1,1]}} transition={{duration:2,repeat:Infinity,delay:k*.35,ease:'easeInOut'}} style={{fontFamily:'Syne,sans-serif',fontSize:42,fontWeight:800,color:c,transition:'color .3s',display:'inline-block'}}>{ch}</motion.span>)}</div>
      <div style={{opacity:v?1:0,transform:v?'translateY(0) scale(1)':'translateY(-8px) scale(.96)',transition:'opacity .28s,transform .28s',fontFamily:'monospace',fontSize:17,fontWeight:700,color:c,background:`${c}12`,padding:'8px 18px',borderRadius:10,border:`2px solid ${c}22`,letterSpacing:.8}}>{t}</div>
      <div style={{fontSize:10,color:'#bbb',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px'}}>{l}</div>
      <div style={{display:'flex',gap:4}}>{S.map((_,k)=><div key={k} style={{width:5,height:5,borderRadius:'50%',background:k===i?S[k].c:'#e0e0e8',transition:'background .3s'}}/>)}</div>
    </div>
  </AnimBox>
})

/* 4. UNITS */
const UnitAnim = memo(()=>{
  const [v,setV]=useState(1);const [ci,setCi]=useState(0)
  const P=[['1 km','0.621 mi'],['100 kg','220.5 lb'],['25 °C','77.0 °F'],['5 L','1.32 gal']]
  const [fr,to]=P[ci%P.length]
  useEffect(()=>{const t=setInterval(()=>setV(x=>x>=3?.2:+(x+.04).toFixed(2)),50);const t2=setInterval(()=>setCi(i=>i+1),3500);return()=>{clearInterval(t);clearInterval(t2)}},[])
  return <AnimBox bg="linear-gradient(135deg,#f0fdf4,#f0f4ff)" minH={200}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,width:'100%',maxWidth:260}}>
      <div style={{width:'100%'}}><motion.div animate={{scaleX:.3+v/3*.7}} style={{transformOrigin:'left',background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)',height:5,borderRadius:3}} transition={{duration:.05}}/><div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>{Array.from({length:7}).map((_,i)=><div key={i} style={{width:1,height:i%3===0?10:6,background:`rgba(79,142,247,${i%3===0?.5:.22})`}}/>)}</div></div>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <div style={{textAlign:'center'}}><motion.div key={fr} animate={{opacity:[0,1],y:[-3,0]}} style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:800,color:'#4F8EF7'}}>{fr}</motion.div><div style={{fontSize:9,color:'#ccc',fontWeight:700}}>FROM</div></div>
        <motion.div animate={{x:[-3,3,-3]}} transition={{duration:1.2,repeat:Infinity}} style={{fontSize:20,color:'#ddd'}}>⇄</motion.div>
        <div style={{textAlign:'center'}}><motion.div key={to} animate={{opacity:[0,1],y:[-3,0]}} style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:800,color:'#9C6FDE'}}>{to}</motion.div><div style={{fontSize:9,color:'#ccc',fontWeight:700}}>TO</div></div>
      </div>
      <div style={{width:'100%',height:4,background:'#e5e7ef',borderRadius:2,overflow:'hidden'}}><motion.div animate={{width:`${Math.min(100,(v/3)*100)}%`}} transition={{duration:.05}} style={{height:'100%',background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)',borderRadius:2}}/></div>
    </div>
  </AnimBox>
})

/* 5. CURRENCY */
const CurrAnim = memo(()=>{
  const PAIRS = [
    { from: ['🇺🇸', 'USD'], to: ['🇪🇺', 'EUR'], rate: '0.92' },
    { from: ['🇪🇺', 'EUR'], to: ['🇬🇧', 'GBP'], rate: '0.86' },
    { from: ['🇬🇧', 'GBP'], to: ['🇯🇵', 'JPY'], rate: '194.5' },
    { from: ['🇺🇸', 'USD'], to: ['🇮🇳', 'INR'], rate: '83.5' },
    { from: ['🇪🇺', 'EUR'], to: ['🇺🇸', 'USD'], rate: '1.09' },
    { from: ['🇺🇸', 'USD'], to: ['🇯🇵', 'JPY'], rate: '152.0' },
  ]
  const [ci,setCi]=useState(0);const [fl,setFl]=useState(false)
  useEffect(()=>{const t=setInterval(()=>{setFl(true);setTimeout(()=>{setCi(i=>(i+1)%PAIRS.length);setFl(false)},280)},1800);return()=>clearInterval(t)},[])
  const pair = PAIRS[ci]
  return <AnimBox bg="linear-gradient(135deg,#fffbf0,#f0f4ff)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:15}}>
      <div style={{display:'flex',alignItems:'center',gap:20}}>
        <motion.div animate={{scaleX:fl?0:1}} transition={{duration:.14}} style={{textAlign:'center'}}><div style={{fontSize:42,marginBottom:5}}>{pair.from[0]}</div><div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:800,color:'#4F8EF7'}}>{pair.from[1]}</div></motion.div>
        <div style={{display:'flex',flexDirection:'column',gap:3.5}}>{[0,1,2,3,4].map(i=><motion.div key={i} animate={{x:[0,16,0],opacity:[0,1,0]}} transition={{duration:.8,repeat:Infinity,delay:i*.12}} style={{width:4.5,height:4.5,borderRadius:'50%',background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)'}}/>)}</div>
        <motion.div animate={{scaleX:fl?0:1}} transition={{duration:.14,delay:.13}} style={{textAlign:'center'}}><div style={{fontSize:42,marginBottom:5}}>{pair.to[0]}</div><div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:800,color:'#9C6FDE'}}>{pair.to[1]}</div></motion.div>
      </div>
      <motion.div key={ci} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} style={{background:'rgba(255,255,255,.9)',border:'1px solid rgba(79,142,247,.15)',borderRadius:10,padding:'6px 18px',fontSize:12.5,fontWeight:600,color:'#444'}}>1 {pair.from[1]} = {pair.rate} {pair.to[1]}</motion.div>
    </div>
  </AnimBox>
})

/* 6. GRADIENT */
const GradAnim = memo(()=>{
  const ref=useRef(null);const raf=useRef(null)
  useEffect(()=>{
    const c=ref.current;if(!c)return
    const dpr=Math.min(window.devicePixelRatio||1,2),W=280,H=120
    c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px'
    const ctx=c.getContext('2d');ctx.scale(dpr,dpr)
    const tick=()=>{const t=Date.now()/1000,h1=(t*26)%360,h2=(h1+85)%360,h3=(h1+170)%360;const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,`hsl(${h1},78%,63%)`);g.addColorStop(.45,`hsl(${h2},80%,64%)`);g.addColorStop(1,`hsl(${h3},78%,63%)`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);for(let x=0;x<W;x+=2){const y=H/2+Math.sin(x/27+t*2)*14;ctx.fillStyle='rgba(255,255,255,.07)';ctx.fillRect(x,y-2,2,4)};raf.current=requestAnimationFrame(tick)}
    tick();return()=>cancelAnimationFrame(raf.current)
  },[])
  return <AnimBox bg="#f8f0ff" minH={200}><div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:11}}><canvas ref={ref} style={{borderRadius:12,boxShadow:'0 6px 24px rgba(0,0,0,.12)',display:'block'}}/><div style={{display:'flex',gap:6}}>{['linear','radial','conic'].map((t,i)=><motion.span key={t} animate={{opacity:[.5,1,.5]}} transition={{duration:2,repeat:Infinity,delay:i*.6}} style={{fontSize:9.5,padding:'3px 9px',borderRadius:999,background:'rgba(79,142,247,.09)',color:'#4F8EF7',fontWeight:700,border:'1px solid rgba(79,142,247,.18)'}}>{t}</motion.span>)}</div></div></AnimBox>
})

/* 7. QUOTE */
const QuoteAnim = memo(()=>{
  const S=['"Stay hungry…"','"Ship it."','"Code > talk"','"Build fast."','"Be curious."']
  const [fl,setFl]=useState([]);const id=useRef(0)
  useEffect(()=>{const t=setInterval(()=>{const n=++id.current;setFl(f=>[...f.slice(-5),{id:n,txt:S[n%S.length],x:5+Math.random()*55,hue:220+Math.random()*80}])},680);return()=>clearInterval(t)},[])
  return <AnimBox bg="linear-gradient(135deg,#fff0f6,#f0f4ff)" minH={195}>
    <div style={{position:'relative',width:'100%',height:158,overflow:'hidden'}}>
      <AnimatePresence>{fl.map(c=><motion.div key={c.id} initial={{opacity:0,y:160,x:`${c.x}%`,scale:.8}} animate={{opacity:[0,1,.9,0],y:[160,90,40,-20]}} transition={{duration:3,ease:'easeOut'}} style={{position:'absolute',background:'#fff',border:`1px solid hsl(${c.hue},55%,85%)`,borderRadius:10,padding:'7px 12px',fontSize:11.5,fontWeight:600,color:`hsl(${c.hue},52%,42%)`,whiteSpace:'nowrap'}}>{c.txt}</motion.div>)}</AnimatePresence>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 60%,transparent 30%,rgba(250,250,255,.85) 100%)',pointerEvents:'none'}}/>
    </div>
  </AnimBox>
})

/* 8. FAVICON */
const FavAnim = memo(()=>{
  const IC=['🚀','💎','⚡','🔥','🎯','🧰','🌟','🎨']
  const [ic,setIc]=useState(0)
  useEffect(()=>{const t=setInterval(()=>setIc(i=>(i+1)%IC.length),1700);return()=>clearInterval(t)},[])
  return <AnimBox bg="linear-gradient(135deg,#e8f4fd,#f0f0ff)" minH={200}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:15}}>
      <motion.div key={ic} initial={{scale:.5,opacity:0,rotate:-18}} animate={{scale:1,opacity:1,rotate:0}} transition={{type:'spring',stiffness:280,damping:16}} style={{fontSize:52}}>{IC[ic]}</motion.div>
      <div style={{display:'flex',alignItems:'flex-end',gap:13}}>
        <motion.span animate={{x:[0,5,0]}} transition={{duration:.9,repeat:Infinity}} style={{fontSize:14,color:'#ccc'}}>→</motion.span>
        {[64,32,16].map((s,i)=><motion.div key={s} animate={{y:[0,-7,0]}} transition={{duration:1.8,repeat:Infinity,delay:i*.25}} style={{textAlign:'center'}}><div style={{width:s,height:s,background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',borderRadius:s>24?12:s>12?6:3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:s*.5,border:'2px solid rgba(255,255,255,.9)',boxShadow:'0 4px 14px rgba(79,142,247,.3)',marginBottom:3}}>{IC[ic]}</div><div style={{fontSize:9,color:'#bbb',fontWeight:700}}>{s}px</div></motion.div>)}
      </div>
    </div>
  </AnimBox>
})

/* 9. YOUTUBE */
const ThumbAnim = memo(()=>{
  const [pop,setPop]=useState(false)
  useEffect(()=>{const t=setInterval(()=>setPop(p=>!p),2200);return()=>clearInterval(t)},[])
  return <AnimBox bg="linear-gradient(135deg,#f0f4ff,#fff0f0)" minH={220}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
      <motion.div animate={{scale:pop?[.92,1.04,1]:1}} transition={{duration:.42,ease:[.22,1,.36,1]}} style={{width:220,borderRadius:10,overflow:'hidden',boxShadow:'0 10px 32px rgba(0,0,0,.14)',border:'1px solid rgba(0,0,0,.07)'}}>
        <div style={{width:'100%',height:124,background:'linear-gradient(135deg,#1a1a2e,#0f3460)',position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <motion.div animate={{scale:[1,1.14,1]}} transition={{duration:1.4,repeat:Infinity}}>
            <div style={{width:42,height:42,background:'rgba(255,0,0,.9)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px rgba(255,0,0,.4)'}}><div style={{width:0,height:0,borderTop:'9px solid transparent',borderBottom:'9px solid transparent',borderLeft:'17px solid white',marginLeft:3}}/></div>
          </motion.div>
          <div style={{position:'absolute',bottom:6,right:7,background:'rgba(0,0,0,.8)',color:'#fff',fontSize:9.5,fontWeight:700,padding:'2px 5px',borderRadius:3}}>5:47</div>
        </div>
        <div style={{background:'#fff',padding:'8px 10px',display:'flex',gap:7,alignItems:'flex-start'}}><div style={{width:26,height:26,borderRadius:'50%',background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',flexShrink:0}}/><div><div style={{fontSize:10.5,fontWeight:600,color:'#1a1a1a',lineHeight:1.3}}>Amazing Video Title</div><div style={{fontSize:9.5,color:'#aaa'}}>Channel · 2.4M views</div></div></div>
      </motion.div>
      <div style={{display:'flex',gap:5}}>{['1280×720','480×360','120×90'].map(s=><span key={s} style={{fontSize:9,padding:'2px 7px',borderRadius:999,background:'rgba(79,142,247,.08)',color:'#4F8EF7',fontWeight:700,border:'1px solid rgba(79,142,247,.15)'}}>{s}</span>)}</div>
    </div>
  </AnimBox>
})

/* 10. IMAGE RESIZER — simple static, no canvas */
const ImgResAnim = memo(()=>{
  const [w,setW]=useState(100)
  useEffect(()=>{let d=1;const t=setInterval(()=>{setW(v=>{if(v>=180){d=-1}else if(v<=70){d=1};return v+d*1.5});},30);return()=>clearInterval(t)},[])
  const h=Math.round(w*0.66)
  return <AnimBox bg="linear-gradient(135deg,#f0f8ff,#f5f0ff)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
      <div style={{position:'relative',padding:20}}>
        <motion.div animate={{width:w,height:h}} transition={{duration:.04}} style={{background:'linear-gradient(135deg,rgba(79,142,247,.18),rgba(156,111,222,.18))',border:'2px solid rgba(79,142,247,.55)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',minWidth:60,minHeight:40}}>
          <span style={{fontSize:Math.round(Math.min(w,h)*.3),userSelect:'none'}}>🖼️</span>
          {[[0,0],[100,0],[0,100],[100,100]].map(([px,py],i)=><div key={i} style={{position:'absolute',width:10,height:10,background:'#4F8EF7',borderRadius:3,left:`${px}%`,top:`${py}%`,transform:'translate(-50%,-50%)',boxShadow:'0 2px 6px rgba(79,142,247,.4)'}}/>)}
        </motion.div>
      </div>
      <div style={{display:'flex',gap:14,fontSize:12,fontWeight:700}}><span style={{color:'#4F8EF7'}}>{Math.round(w*6)}px</span><span style={{color:'#ddd'}}>×</span><span style={{color:'#9C6FDE'}}>{Math.round(h*6)}px</span></div>
    </div>
  </AnimBox>
})

/* 11. IMAGE COMPRESSOR */
const ImgCompAnim = memo(()=>{
  const ref=useRef(null);const raf=useRef(null)
  useEffect(()=>{
    const c=ref.current;if(!c)return
    const dpr=Math.min(window.devicePixelRatio||1,2),W=280,H=180
    c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px'
    const ctx=c.getContext('2d');ctx.scale(dpr,dpr)
    const tick=()=>{
      const t=Date.now()/1000,pct=.28+.72*((Math.sin(t*.55)+1)/2);ctx.clearRect(0,0,W,H)
      const bw=110,bh=80,bx=(W-bw*2-22)/2,by=(H-bh)/2+5
      ctx.fillStyle='rgba(79,142,247,.08)';ctx.beginPath();rr(ctx, bx,by,bw,bh,9);ctx.fill()
      ctx.strokeStyle='rgba(79,142,247,.28)';ctx.lineWidth=1.5;ctx.beginPath();rr(ctx, bx,by,bw,bh,9);ctx.stroke()
      ctx.font='24px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('📷',bx+bw/2,by+bh/2-4)
      ctx.font='700 9px DM Sans';ctx.fillStyle='#aaa';ctx.textBaseline='bottom';ctx.fillText('2.40 MB',bx+bw/2,by+bh+14)
      ctx.fillStyle='rgba(79,142,247,.4)';ctx.font='15px serif';ctx.textBaseline='middle';ctx.fillText('→',bx+bw+8,H/2)
      const rx=bx+bw+22,rh=Math.round(bh*pct),ry=by+(bh-rh)
      ctx.fillStyle='rgba(79,142,247,.72)';ctx.beginPath();rr(ctx, rx-4,ry-8,bw+8,7,4);ctx.fill()
      ctx.fillStyle='rgba(156,111,222,.12)';ctx.beginPath();rr(ctx, rx,ry,bw,rh,7);ctx.fill()
      ctx.strokeStyle='rgba(156,111,222,.44)';ctx.lineWidth=1.5;ctx.beginPath();rr(ctx, rx,ry,bw,rh,7);ctx.stroke()
      if(rh>20){ctx.font=`${Math.round(20*pct+5)}px serif`;ctx.textBaseline='middle';ctx.fillText('📷',rx+bw/2,ry+rh/2)}
      const saved=Math.round((1-pct)*100),sc=saved>40?'#22c55e':'#9C6FDE'
      ctx.font='700 9px DM Sans';ctx.fillStyle=sc;ctx.textBaseline='bottom';ctx.fillText(`${((2400*pct)/1000).toFixed(2)} MB (${saved}% off)`,rx+bw/2,by+bh+14)
      const bY=H-14,bX=22,bW=W-44;ctx.fillStyle='#e5e7ef';ctx.beginPath();rr(ctx, bX,bY,bW,4,2);ctx.fill()
      ctx.fillStyle=sc;ctx.beginPath();rr(ctx, bX,bY,bW*(saved/100),4,2);ctx.fill()
      raf.current=requestAnimationFrame(tick)
    }
    tick();return()=>cancelAnimationFrame(raf.current)
  },[])
  return <AnimBox bg="linear-gradient(135deg,#f0fff4,#f0f4ff)" minH={200}><canvas ref={ref} style={{borderRadius:10,display:'block',maxWidth:'100%'}}/></AnimBox>
})

/* 12. IMAGE CONVERTER */
const ImgConvAnim = memo(()=>{
  const F=[{em:'🖼',l:'PNG',c:'#4F8EF7',bg:'#EEF4FF'},{em:'📷',l:'JPEG',c:'#F06292',bg:'#FFF0F6'},{em:'✨',l:'WebP',c:'#22c55e',bg:'#F0FFF4'}]
  const [fi,setFi]=useState(0);const [ph,setPh]=useState('idle')
  useEffect(()=>{const t=setInterval(()=>{setPh('out');setTimeout(()=>{setFi(i=>(i+1)%F.length);setPh('in')},350);setTimeout(()=>setPh('idle'),820)},1800);return()=>clearInterval(t)},[])
  const cur=F[fi],nxt=F[(fi+1)%F.length]
  return <AnimBox bg="linear-gradient(135deg,#f0fdf4,#f0f4ff)" minH={200}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
      <div style={{display:'flex',alignItems:'center',gap:20}}>
        <motion.div animate={{scale:ph==='out'?.82:1,opacity:ph==='out'?.4:1}} style={{textAlign:'center'}}><div style={{width:64,height:64,borderRadius:16,background:cur.bg,border:`2px solid ${cur.c}28`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:30}}>{cur.em}</div><div style={{fontFamily:'Syne,sans-serif',fontSize:12.5,fontWeight:700,color:cur.c,marginTop:6}}>{cur.l}</div></motion.div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>{[0,1,2,3,4].map(i=><motion.div key={i} animate={{x:ph==='out'?[0,20,38]:0,opacity:ph==='out'?[0,1,0]:.22}} transition={{duration:.38,delay:i*.05}} style={{width:5,height:5,borderRadius:'50%',background:`linear-gradient(135deg,${cur.c},${nxt.c})`}}/>)}</div>
        <motion.div animate={{scale:ph==='in'?[.85,1.08,1]:1}} transition={{duration:.32}} style={{textAlign:'center'}}><div style={{width:64,height:64,borderRadius:16,background:nxt.bg,border:`2px solid ${nxt.c}28`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:30}}>{nxt.em}</div><div style={{fontFamily:'Syne,sans-serif',fontSize:12.5,fontWeight:700,color:nxt.c,marginTop:6}}>{nxt.l}</div></motion.div>
      </div>
      <div style={{display:'flex',gap:5}}>{F.map((f,i)=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:i===fi?f.c:'#e0e0e8',transition:'background .3s'}}/>)}</div>
    </div>
  </AnimBox>
})

/* 13. BG REMOVER */
const BGRemAnim = memo(()=>{
  const ref=useRef(null);const raf=useRef(null)
  useEffect(()=>{
    const c=ref.current;if(!c)return
    const dpr=Math.min(window.devicePixelRatio||1,2),W=280,H=180
    c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px'
    const ctx=c.getContext('2d');ctx.scale(dpr,dpr)
    const COLS=10,ROWS=7,cw=W/COLS,ch=H/ROWS
    const tick=()=>{
      const t=Date.now()/1000,pct=(Math.sin(t*.45)*.5+.5);ctx.clearRect(0,0,W,H)
      for(let r=0;r<ROWS;r++)for(let cl=0;cl<COLS;cl++){ctx.fillStyle=(r+cl)%2===0?'#f0f0f2':'#e4e4e8';ctx.fillRect(cl*cw,r*ch,cw,ch)}
      const cx=COLS/2,cy=ROWS/2
      for(let r=0;r<ROWS;r++){for(let cl=0;cl<COLS;cl++){const dist=Math.sqrt((cl-cx)**2+(r-cy)**2),thresh=pct*7;if(dist>thresh){const a=Math.min(1,(dist-thresh)*.85);ctx.fillStyle=`rgba(100,180,255,${a})`;ctx.fillRect(cl*cw+1,r*ch+1,cw-2,ch-2);if(Math.abs(dist-thresh)<.7){const pa=Math.abs(Math.sin(t*5+dist))*.75;ctx.fillStyle=`rgba(79,142,247,${pa})`;ctx.beginPath();ctx.arc(cl*cw+cw/2,r*ch+ch/2,2.5,0,Math.PI*2);ctx.fill()}}}}
      ctx.font='50px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('👤',W/2,H/2)
      ctx.font='700 10px DM Sans';ctx.fillStyle=pct>.58?'#22c55e':'#4F8EF7';ctx.textBaseline='bottom';ctx.fillText(pct>.58?'✓ Background removed':'⚙ Removing…',W/2,H-3)
      raf.current=requestAnimationFrame(tick)
    }
    tick();return()=>cancelAnimationFrame(raf.current)
  },[])
  return <AnimBox bg="#f5f5f8" minH={200}><canvas ref={ref} style={{borderRadius:10,boxShadow:'0 6px 22px rgba(0,0,0,.09)',display:'block',maxWidth:'100%'}}/></AnimBox>
})

/* 14. PDF */
const PDFAnim = memo(()=>{
  const [merged,setMerged]=useState(false);const [phase,setPhase]=useState(0)
  useEffect(()=>{const s=[()=>setPhase(1),()=>{setMerged(true);setPhase(2)},()=>setPhase(3),()=>{setMerged(false);setPhase(0)}];let i=0;const t=setInterval(()=>{s[i%4]();i++},1300);return()=>clearInterval(t)},[])
  const D=[{c:'#4F8EF7'},{c:'#9C6FDE'},{c:'#F06292'}]
  return <AnimBox bg="linear-gradient(135deg,#fff8f0,#f0f4ff)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:13}}>
      <div style={{position:'relative',width:180,height:130}}>{D.map((d,i)=><motion.div key={i} animate={merged?{x:0,y:0,rotate:0}:{x:(i-1)*46,y:i*6,rotate:(i-1)*5}} transition={{duration:.52,ease:[.22,1,.36,1]}} style={{position:'absolute',left:'50%',top:'50%',marginLeft:-40,marginTop:-55,width:80,height:110,background:'#fff',border:`1.5px solid ${d.c}38`,borderRadius:8,padding:'9px 7px',boxShadow:`0 4px 16px ${d.c}1E`,display:'flex',flexDirection:'column',gap:4}}><div style={{width:'100%',height:3,background:d.c,borderRadius:2,opacity:.7}}/>{[75,90,65].map((w,j)=><div key={j} style={{width:`${w}%`,height:2,background:'rgba(0,0,0,.07)',borderRadius:1}}/>)}<div style={{marginTop:'auto',textAlign:'center',fontSize:18}}>📄</div></motion.div>)}</div>
      <div style={{fontSize:12,fontWeight:700,color:phase===2?'#22c55e':'#4F8EF7',transition:'color .3s'}}>{phase===0?'📄 3 documents':phase===1?'🔄 Merging…':phase===2?'✅ Merged!':'✂️ Splitting…'}</div>
    </div>
  </AnimBox>
})

/* 15. ASPECT RATIO */
const AspectAnim = memo(()=>{
  const [ratio,setRatio]=useState({w:16,h:9})
  const RATIOS=[{w:16,h:9},{w:4,h:3},{w:1,h:1},{w:21,h:9},{w:9,h:16}]
  const [ri,setRi]=useState(0)
  useEffect(()=>{const t=setInterval(()=>{const n=(ri+1)%RATIOS.length;setRi(n);setRatio(RATIOS[n])},1800);return()=>clearInterval(t)},[ri])
  const maxW=200,maxH=130,scale=Math.min(maxW/ratio.w,maxH/ratio.h)
  const rw=Math.round(ratio.w*scale),rh=Math.round(ratio.h*scale)
  return <AnimBox bg="linear-gradient(135deg,#e8f5e9,#f0f4ff)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
      <motion.div animate={{width:rw,height:rh}} transition={{type:'spring',stiffness:120,damping:18}}
        style={{background:'linear-gradient(135deg,rgba(79,142,247,.15),rgba(156,111,222,.12))',border:'2px solid rgba(79,142,247,.5)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',minWidth:40,minHeight:30}}>
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(79,142,247,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(79,142,247,.06) 1px,transparent 1px)',backgroundSize:'16px 16px',borderRadius:4}}/>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:800,color:'rgba(79,142,247,.7)',position:'relative'}}>{ratio.w}:{ratio.h}</div>
        {[[0,50],[100,50],[50,0],[50,100]].map(([px,py],i)=><motion.div key={i} animate={{scale:[1,1.3,1]}} transition={{duration:1,repeat:Infinity,delay:i*.2}} style={{position:'absolute',width:6,height:6,borderRadius:'50%',background:'#4F8EF7',left:`calc(${px}% - 3px)`,top:`calc(${py}% - 3px)`}}/>)}
      </motion.div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
        {RATIOS.map((r,i)=><motion.span key={`${r.w}:${r.h}`} animate={{scale:i===ri?1.1:1}} style={{fontSize:10.5,padding:'3px 9px',borderRadius:999,fontWeight:700,cursor:'pointer',border:`1.5px solid ${i===ri?'#4F8EF7':'rgba(0,0,0,.1)'}`,background:i===ri?'rgba(79,142,247,.1)':'#f5f5f8',color:i===ri?'#4F8EF7':'#888',transition:'all .2s'}} onClick={()=>{setRi(i);setRatio(r)}}>{r.w}:{r.h}</motion.span>)}
      </div>
    </div>
  </AnimBox>
})

/* 17. PASSWORD VAULT */
const VaultAnim = memo(()=>{
  const [open,setOpen]=useState(false)
  useEffect(()=>{const t=setInterval(()=>setOpen(o=>!o),2500);return()=>clearInterval(t)},[])
  return <AnimBox bg="linear-gradient(135deg,#fbe9e7,#f0f4ff)" minH={220}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
      <div style={{position:'relative',width:100,height:100}}>
        <motion.div animate={{rotateY:open?-120:0}} transition={{duration:.8,ease:[.22,1,.36,1]}}
          style={{width:100,height:100,background:open?'transparent':'linear-gradient(135deg,#607D8B,#455A64)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:50,boxShadow:open?'none':'0 8px 24px rgba(0,0,0,.2)',transformStyle:'preserve-3d',transformOrigin:'left center'}}>
          {!open&&'🔐'}
        </motion.div>
        {open&&<motion.div initial={{opacity:0,scale:.8}} animate={{opacity:1,scale:1}} transition={{delay:.5}} style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:50}}>🏦</motion.div>}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:open?'#22c55e':'#607D8B',transition:'color .3s'}}>{open?'🔓 Vault Open':'🔐 Vault Locked'}</div>
      <div style={{display:'flex',flexDirection:'column',gap:7,width:'100%',maxWidth:220}}>
        {['Google Account','GitHub Token','Wi-Fi Password'].map((label,i)=>(
          <motion.div key={label} initial={{opacity:0,x:30}} animate={{opacity:open?1:0,x:open?0:30}} transition={{delay:open?.4+i*.08:.1}} style={{background:'#fff',borderRadius:10,padding:'8px 12px',display:'flex',alignItems:'center',gap:9,boxShadow:'0 2px 10px rgba(0,0,0,.07)',border:'1px solid rgba(0,0,0,.06)'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:'#22c55e',animation:'pulse 2s ease infinite'}}/>
            <div style={{fontSize:12,fontWeight:600,color:'#333',flex:1}}>{label}</div>
            <span style={{fontSize:11,color:'#bbb'}}>••••••</span>
          </motion.div>
        ))}
      </div>
    </div>
    <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}`}</style>
  </AnimBox>
})

/* 18. IMAGE BORDER */
const ImageToolsAnim = memo(()=>{
  const [phase, setPhase] = useState(0) // 0=border, 1=corner
  const [bw,    setBw]    = useState(4)
  const [r,     setR]     = useState(8)
  const [hue,   setHue]   = useState(220)
  useEffect(()=>{
    let bwDir=1, rDir=1
    const t=setInterval(()=>{
      setBw(v=>{ if(v>=18)bwDir=-1; else if(v<=2)bwDir=1; return Math.max(2,v+bwDir*.3) })
      setR(v=>{ if(v>=55)rDir=-1; else if(v<=0)rDir=1; return Math.max(0,v+rDir*.8) })
      setHue(h=>(h+.8)%360)
    },40)
    const pt=setInterval(()=>setPhase(p=>(p+1)%2),2800)
    return()=>{ clearInterval(t); clearInterval(pt) }
  },[])
  return <AnimBox bg="linear-gradient(135deg,#f3f0ff,#e0f7fa)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
      <div style={{display:'flex',gap:8,marginBottom:4}}>
        {['🖼️ Border','⬜ Corner'].map((l,i)=>(
          <span key={l} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,
            background:phase===i?`hsl(${hue},65%,92%)`:'rgba(0,0,0,.05)',
            color:phase===i?`hsl(${hue},55%,38%)`:'#aaa',transition:'all .3s'}}>
            {l}
          </span>
        ))}
      </div>
      {phase===0
        ? <motion.div animate={{padding:bw}} style={{background:`hsl(${hue},70%,58%)`,borderRadius:12,
            transition:'padding .05s',boxShadow:`0 8px 28px hsl(${hue},60%,65%)44`}}>
            <div style={{width:110,height:80,background:'linear-gradient(135deg,rgba(255,255,255,.25),rgba(255,255,255,.06))',
              borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:34}}>🖼️</div>
          </motion.div>
        : <motion.div animate={{borderRadius:r,width:r>=55?150:110,height:76}} transition={{duration:.05}}
            style={{background:'linear-gradient(135deg,rgba(79,142,247,.2),rgba(156,111,222,.2))',
              border:'2.5px solid rgba(79,142,247,.55)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontFamily:'Syne,sans-serif',fontSize:12,fontWeight:700,color:'rgba(79,142,247,.8)'}}>
              {r>=55?'pill':r===0?'sharp':`${Math.round(r)}px`}
            </span>
          </motion.div>
      }
      <div style={{fontFamily:'monospace',fontSize:11,color:'#4F8EF7',
        background:'rgba(79,142,247,.08)',padding:'4px 12px',borderRadius:6}}>
        {phase===0?`border: ${Math.round(bw)}px solid hsl(${Math.round(hue)},70%,58%)`:`border-radius: ${Math.round(r)}px`}
      </div>
    </div>
  </AnimBox>
})

/* ═══════════════════════════════════════════════════════════════
   WORD REPLACER — Advanced 60fps Canvas Animation
   • Particles burst when replacement fires
   • Sentence morphs with spring spring physics per-character
   • Scan beam sweeps across finding matches
   • Stats counter (words replaced, time saved) increments
   • Multi-sentence loop with 4 word-pair demos
   ═══════════════════════════════════════════════════════════════ */
const WordReplaceAnim = memo(() => {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const P = canvas.parentElement
    const CW = Math.max(P?.clientWidth || 340, 100), CH = 220
    canvas.width = CW * dpr; canvas.height = CH * dpr
    canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px'
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    /* ── Demo pairs ── */
    const DEMOS = [
      { sentence:'The fast brown fox', find:'fast',   rep:'lightning', col:'#f97316' },
      { sentence:'A big old mistake',  find:'big',    rep:'massive',   col:'#dc2626' },
      { sentence:'She was very happy', find:'very',   rep:'extremely', col:'#9C6FDE' },
      { sentence:'The bad decision',   find:'bad',    rep:'terrible',  col:'#2563eb' },
    ]

    /* ── State ── */
    let demo     = 0
    let phase    = 0    // 0=idle, 1=scan, 2=highlight, 3=burst, 4=replaced, 5=rest
    let phaseT   = 0
    let t        = 0
    let scanX    = 0    // beam x position
    let replaced = false
    let particles = []  // burst particles
    let totalReplaced = 0
    let flashAlpha = 0  // green flash on replace

    /* ── Particle factory ── */
    const burst = (cx, cy, col) => {
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2
        const speed = 1.5 + Math.random() * 2.5
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 1, decay: 0.028 + Math.random() * 0.025,
          r: 2 + Math.random() * 3,
          col,
        })
      }
    }

    /* ── Measure sentence layout ── */
    const layout = (sentence, find, isReplaced, rep) => {
      ctx.font = '600 14px DM Sans, sans-serif'
      const words = sentence.split(' ')
      const items = []
      let totalW = 0
      words.forEach(w => {
        const draw = (isReplaced && w === find) ? rep : w
        const ww   = ctx.measureText(draw).width
        items.push({ word: w, draw, ww, isTarget: w === find })
        totalW += ww
      })
      totalW += (words.length - 1) * 8
      let x = (CW - totalW) / 2
      items.forEach(it => { it.x = x; x += it.ww + 8 })
      return items
    }

    const PHASE_DUR = [0.8, 1.0, 0.7, 0.5, 1.2, 0.6]

    const tick = () => {
      t += 1/60; phaseT += 1/60
      ctx.clearRect(0, 0, CW, CH)

      const D = DEMOS[demo % DEMOS.length]

      /* Phase advance */
      if (phaseT >= PHASE_DUR[phase]) {
        phaseT = 0
        if (phase === 1) scanX = 0
        if (phase === 3) { totalReplaced++; flashAlpha = 1 }
        phase = (phase + 1) % 6
        if (phase === 0) { demo++; replaced = false; particles = [] }
        if (phase === 4) replaced = true
      }

      /* ── 1. DOT GRID ── */
      ctx.fillStyle = 'rgba(79,142,247,.05)'
      for (let gx = 0; gx <= CW; gx += 22)
        for (let gy = 0; gy <= CH; gy += 22) {
          ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill()
        }

      /* ── 2. GREEN FLASH on replace ── */
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(34,197,94,${flashAlpha * 0.08})`
        ctx.fillRect(0, 0, CW, CH)
        flashAlpha -= 0.04
      }

      /* ── 3. SENTENCE ── */
      const LINE_Y  = CH / 2 - 26
      const items   = layout(D.sentence, D.find, replaced, D.rep)
      const targetIt= items.find(i => i.isTarget)

      items.forEach(it => {
        const isHighlighted = it.isTarget && (phase === 2 || phase === 3)
        const isFixed       = it.isTarget && replaced

        if (isHighlighted) {
          /* Orange glow box */
          const pad = 6
          ctx.shadowColor = D.col; ctx.shadowBlur = 12
          ctx.fillStyle   = `${D.col}22`
          rr(ctx, it.x - pad, LINE_Y - 14, it.ww + pad*2, 28, 6); ctx.fill()
          ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent'
          ctx.strokeStyle = D.col; ctx.lineWidth = 1.5
          rr(ctx, it.x - pad, LINE_Y - 14, it.ww + pad*2, 28, 6); ctx.stroke()
        } else if (isFixed) {
          /* Green success box */
          const pulse = 0.6 + 0.4 * Math.sin(t * 4)
          const pad = 6
          ctx.fillStyle   = `rgba(34,197,94,${0.12 * pulse})`
          rr(ctx, it.x - pad, LINE_Y - 14, it.ww + pad*2, 28, 6); ctx.fill()
          ctx.strokeStyle = `rgba(34,197,94,${0.55 * pulse})`; ctx.lineWidth = 1.5
          rr(ctx, it.x - pad, LINE_Y - 14, it.ww + pad*2, 28, 6); ctx.stroke()
        }

        /* Word text */
        ctx.font = it.isTarget ? '700 14px DM Sans, sans-serif' : '500 14px DM Sans, sans-serif'
        ctx.fillStyle = isFixed
          ? '#166534'
          : isHighlighted ? D.col
          : 'rgba(26,26,46,.72)'
        ctx.textBaseline = 'middle'
        ctx.fillText(it.draw, it.x, LINE_Y)

        /* Wavy underline on highlighted */
        if (isHighlighted) {
          ctx.strokeStyle = D.col; ctx.lineWidth = 1.8; ctx.setLineDash([])
          ctx.beginPath()
          for (let wx = it.x; wx <= it.x + it.ww; wx += 2.5) {
            const wy = LINE_Y + 14 + Math.sin((wx + t * 120) * 0.5) * 2.2
            wx === it.x ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy)
          }
          ctx.stroke()
        }
      })

      /* ── 4. SCAN BEAM ── */
      if (phase === 1 && targetIt) {
        const target = scanX = Math.min(phaseT / PHASE_DUR[1] * CW, targetIt.x + targetIt.ww / 2)
        const bw = 3
        const grad = ctx.createLinearGradient(target - 40, 0, target + 40, 0)
        grad.addColorStop(0, 'rgba(79,142,247,0)')
        grad.addColorStop(0.5, 'rgba(79,142,247,.25)')
        grad.addColorStop(1, 'rgba(79,142,247,0)')
        ctx.fillStyle = grad
        ctx.fillRect(target - 40, 0, 80, CH)
        /* Beam line */
        ctx.strokeStyle = 'rgba(79,142,247,.5)'; ctx.lineWidth = bw; ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(target, 0); ctx.lineTo(target, CH); ctx.stroke()
        /* Scan label */
        ctx.font = '700 10px DM Sans, sans-serif'
        ctx.fillStyle = 'rgba(79,142,247,.7)'
        ctx.textAlign = 'left'
        const label = `scanning…`
        if (target + 8 + ctx.measureText(label).width < CW - 8) {
          ctx.fillText(label, target + 5, 16)
        }
      }
      ctx.textAlign = 'left'

      /* ── 5. PARTICLES ── */
      if (phase === 3 && targetIt && phaseT < 0.1) {
        burst(targetIt.x + targetIt.ww / 2, LINE_Y, D.col)
      }
      particles = particles.filter(p => p.life > 0)
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= p.decay
        const a = Math.max(0, p.life)
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2)
        ctx.fillStyle = p.col + Math.round(a * 255).toString(16).padStart(2,'0')
        ctx.fill()
      })

      /* ── 6. FIND → REPLACE PILL ROW ── */
      const PILL_Y = LINE_Y + 42
      ctx.font = '600 12px DM Sans, sans-serif'
      const fw = ctx.measureText('"' + D.find + '"').width + 24
      const rw = ctx.measureText('"' + D.rep  + '"').width + 24
      const gap = 28
      const ox  = (CW - fw - gap - rw) / 2

      /* Find pill */
      const fActive = phase >= 1
      ctx.fillStyle = fActive ? `${D.col}1A` : 'rgba(0,0,0,.05)'
      rr(ctx, ox, PILL_Y - 13, fw, 26, 13); ctx.fill()
      if (fActive) {
        ctx.strokeStyle = D.col + '55'; ctx.lineWidth = 1.2
        rr(ctx, ox, PILL_Y - 13, fw, 26, 13); ctx.stroke()
      }
      ctx.fillStyle = fActive ? D.col : '#999'
      ctx.textAlign = 'center'
      ctx.fillText('"' + D.find + '"', ox + fw / 2, PILL_Y)

      /* Arrow */
      ctx.font = '700 15px DM Sans, sans-serif'
      ctx.fillStyle = phase >= 4 ? '#22c55e' : '#4F8EF7'
      ctx.fillText('→', ox + fw + gap / 2, PILL_Y + 1)

      /* Replace pill */
      const rActive = phase >= 4
      ctx.font = '600 12px DM Sans, sans-serif'
      ctx.fillStyle = rActive ? 'rgba(34,197,94,.14)' : 'rgba(0,0,0,.05)'
      rr(ctx, ox + fw + gap, PILL_Y - 13, rw, 26, 13); ctx.fill()
      if (rActive) {
        ctx.strokeStyle = 'rgba(34,197,94,.5)'; ctx.lineWidth = 1.2
        rr(ctx, ox + fw + gap, PILL_Y - 13, rw, 26, 13); ctx.stroke()
      }
      ctx.fillStyle = rActive ? '#16a34a' : '#999'
      ctx.fillText('"' + D.rep + '"', ox + fw + gap + rw / 2, PILL_Y)
      ctx.textAlign = 'left'

      /* ── 7. STATS BADGES ── */
      /* Replacements counter */
      const bx = 12, by = 12
      ctx.fillStyle = 'rgba(13,13,26,.06)'
      rr(ctx, bx, by, 100, 24, 12); ctx.fill()
      ctx.font = '700 10.5px DM Sans, sans-serif'
      ctx.fillStyle = '#666'
      ctx.fillText(`🔄 ${totalReplaced} replaced`, bx + 10, by + 12)

      /* Match badge */
      if (phase === 2) {
        const pulse = 0.7 + 0.3 * Math.sin(t * 6)
        ctx.fillStyle = `rgba(249,115,22,${0.85 * pulse})`
        rr(ctx, CW - 82, by, 70, 24, 12); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = '700 10.5px DM Sans, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('1 match', CW - 47, by + 12)
        ctx.textAlign = 'left'
      }

      /* Fixed badge */
      if (phase === 4) {
        ctx.fillStyle = 'rgba(34,197,94,.88)'
        rr(ctx, CW - 80, by, 68, 24, 12); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = '700 10.5px DM Sans, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('✓ Fixed!', CW - 46, by + 12)
        ctx.textAlign = 'left'
      }

      /* Phase progress dots */
      const PHASES = ['Idle','Scan','Found','Burst','Done','Rest']
      const dotY = CH - 14
      const dotTotal = 4
      for (let di = 0; di < dotTotal; di++) {
        const active = di === (demo % dotTotal)
        const dotR   = active ? 4.5 : 3
        const dotX   = CW / 2 - (dotTotal - 1) * 10 + di * 20
        ctx.beginPath(); ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
        ctx.fillStyle = active ? '#4F8EF7' : 'rgba(79,142,247,.2)'
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <AnimBox bg="linear-gradient(135deg,#fffbf0,#f0f4ff)" minH={220}>
      <canvas ref={canvasRef} style={{ display:'block', width:'100%', borderRadius:10 }}/>
    </AnimBox>
  )
})


const RandNameAnim = memo(()=>{
  const NAMES=[{n:'Lucas Martin',flag:'🇫🇷',col:'#4F8EF7'},{n:'Priya Sharma',flag:'🇮🇳',col:'#F06292'},{n:'Oliver Smith',flag:'🇬🇧',col:'#9C6FDE'},{n:'Yui Tanaka',flag:'🇯🇵',col:'#22c55e'}]
  const [i,setI]=useState(0)
  useEffect(()=>{const t=setInterval(()=>setI(x=>(x+1)%NAMES.length),1600);return()=>clearInterval(t)},[])
  const n=NAMES[i]
  return <AnimBox bg="linear-gradient(135deg,#f0f4ff,#fff0f6)" minH={180}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:10}}>
      <motion.div key={i} initial={{scale:.8,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:280,damping:18}}
        style={{width:56,height:56,borderRadius:'50%',background:`linear-gradient(135deg,${n.col},${n.col}99)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'#fff',fontFamily:'Syne,sans-serif',boxShadow:`0 6px 18px ${n.col}44`}}>
        {n.n[0]}
      </motion.div>
      <motion.div key={n.n} initial={{y:10,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:.12}} style={{textAlign:'center'}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:17,fontWeight:800,color:'#0d0d1a',marginBottom:4}}>{n.n}</div>
        <div style={{fontSize:20}}>{n.flag}</div>
      </motion.div>
      <div style={{display:'flex',gap:7,flexWrap:'wrap',justifyContent:'center'}}>
        {['Phone','Email','Username'].map(f=><span key={f} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,background:'rgba(79,142,247,.08)',color:'#4F8EF7',border:'1px solid rgba(79,142,247,.15)'}}>{f}</span>)}
      </div>
    </div>
  </AnimBox>
})

const RandAddrAnim = memo(()=>{
  const ADDRS=[{line:'42 Rue de la Paix',city:'Paris 75001',flag:'🇫🇷',col:'#4F8EF7'},{line:'123 Oak Street',city:'New York 10001',flag:'🇺🇸',col:'#F06292'},{line:'8 Hauptstraße',city:'Berlin 10115',flag:'🇩🇪',col:'#9C6FDE'},{line:'15 MG Road',city:'Bangalore 560001',flag:'🇮🇳',col:'#22c55e'}]
  const [i,setI]=useState(0)
  useEffect(()=>{const t=setInterval(()=>setI(x=>(x+1)%ADDRS.length),1800);return()=>clearInterval(t)},[])
  const a=ADDRS[i]
  return <AnimBox bg="linear-gradient(135deg,#f0fff4,#f0f4ff)" minH={180}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:10}}>
      <motion.div key={i} initial={{y:-10,opacity:0,scale:.9}} animate={{y:0,opacity:1,scale:1}} transition={{type:'spring',stiffness:260,damping:20}}>
        <div style={{fontSize:40,filter:`drop-shadow(0 4px 10px ${a.col}44)`}}>📍</div>
      </motion.div>
      <motion.div key={a.line} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.14}} style={{textAlign:'center'}}>
        <div style={{fontSize:13,fontWeight:700,color:'#333',marginBottom:3}}>{a.flag} {a.line}</div>
        <div style={{fontSize:12,color:'#888'}}>{a.city}</div>
      </motion.div>
      <div style={{display:'flex',gap:6}}>
        {['Street','City','ZIP','Phone'].map(f=><span key={f} style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,background:`${a.col}12`,color:a.col,border:`1px solid ${a.col}25`}}>{f}</span>)}
      </div>
    </div>
  </AnimBox>
})



/* 23. BCRYPT */
const BcryptAnim = memo(()=>{
  const PW='MyP@ssw0rd!'
  const HASH='$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92l...'
  const [tick,setTick]=useState(0)
  const [hashVisible,setHashVisible]=useState(true)
  useEffect(()=>{
    const t=setInterval(()=>{
      setHashVisible(false)
      setTimeout(()=>setHashVisible(true),300)
      setTick(x=>x+1)
    },2800)
    return()=>clearInterval(t)
  },[])
  return <AnimBox bg="linear-gradient(135deg,#f4f7ff,#f0fff8)" minH={230}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,width:'100%',maxWidth:300,padding:'0 8px'}}>
      {/* Lock icon */}
      <motion.div animate={{rotate:[0,-8,8,-4,0]}} transition={{duration:2.8,repeat:Infinity,repeatDelay:1.4}} style={{fontSize:44,filter:'drop-shadow(0 4px 12px rgba(34,197,94,.3))',lineHeight:1}}>🔒</motion.div>
      {/* PW input row */}
      <div style={{display:'flex',alignItems:'center',gap:8,background:'#fff',borderRadius:999,padding:'8px 16px',border:'1.5px solid rgba(79,142,247,.22)',width:'100%',boxShadow:'0 2px 10px rgba(79,142,247,.08)'}}>
        <span style={{fontSize:9.5,fontWeight:800,color:'#9C6FDE',fontFamily:'Syne,sans-serif',letterSpacing:.5,flexShrink:0,background:'rgba(156,111,222,.1)',padding:'2px 7px',borderRadius:999}}>PW</span>
        <span style={{fontFamily:'monospace',fontSize:13,fontWeight:700,color:'#4F8EF7',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{PW}</span>
      </div>
      {/* Arrow */}
      <motion.div animate={{y:[0,4,0],opacity:[.6,1,.6]}} transition={{duration:1.1,repeat:Infinity}} style={{color:'#22c55e',fontSize:18,fontWeight:700}}>↓</motion.div>
      {/* Hash output */}
      <motion.div animate={{opacity:hashVisible?1:0,scale:hashVisible?1:.97}} transition={{duration:.28}}
        style={{background:'rgba(34,197,94,.07)',border:'1.5px solid rgba(34,197,94,.32)',borderRadius:12,padding:'9px 14px',width:'100%',fontFamily:'monospace',fontSize:11,color:'#1a7a42',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:.3}}>
        {HASH}
      </motion.div>
      {/* Badges */}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center',marginTop:2}}>
        {[
          {l:'bcrypt',c:'#4F8EF7'},
          {l:'salt',c:'#9C6FDE'},
          {l:'rounds:10',c:'#F06292'},
          {l:'60 chars',c:'#22c55e'},
        ].map((b,i)=>(
          <motion.span key={b.l} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{delay:.1+i*.06}}
            style={{fontSize:9.5,padding:'2px 9px',borderRadius:999,background:b.c+'14',color:b.c,border:'1px solid '+b.c+'28',fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>{b.l}</motion.span>
        ))}
      </div>
    </div>
  </AnimBox>
})

/* 24. FILE CONVERTER */
const FileConvAnim = memo(()=>{
  const CONVS=[
    {from:'📝',fromL:'MD', to:'🌐',toL:'HTML',col:'#4F8EF7'},
    {from:'📄',fromL:'TXT',to:'📕',toL:'PDF', col:'#ef4444'},
    {from:'📊',fromL:'CSV',to:'💡',toL:'JSON',col:'#22c55e'},
    {from:'🌐',fromL:'HTML',to:'📝',toL:'MD', col:'#9C6FDE'},
    {from:'💡',fromL:'JSON',to:'📊',toL:'CSV',col:'#f59e0b'},
  ]
  const [ci,setCi]=useState(0)
  const [spin,setSpin]=useState(false)
  useEffect(()=>{
    const t=setInterval(()=>{
      setSpin(true)
      setTimeout(()=>{setCi(i=>(i+1)%CONVS.length);setSpin(false)},350)
    },1800)
    return()=>clearInterval(t)
  },[])
  const c=CONVS[ci]
  return <AnimBox bg="linear-gradient(135deg,#f0f9ff,#f0fff8)" minH={210}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,width:'100%',maxWidth:300,padding:'6px 10px'}}>
      {/* Main row: from → gear → to */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,width:'100%'}}>
        {/* FROM */}
        <motion.div key={ci+'f'} initial={{x:-14,opacity:0}} animate={{x:0,opacity:1}} transition={{duration:.3,ease:[.22,1,.36,1]}} style={{textAlign:'center',minWidth:54}}>
          <div style={{fontSize:36,lineHeight:1,marginBottom:5}}>{c.from}</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:800,color:'#555',letterSpacing:.3}}>{c.fromL}</div>
        </motion.div>
        {/* Arrow dots */}
        <div style={{display:'flex',flexDirection:'column',gap:3.5,alignItems:'center'}}>
          {[0,1,2].map(i=>(
            <motion.div key={i} animate={{x:[0,8,0],opacity:[0,.8,0]}} transition={{duration:.7,repeat:Infinity,delay:i*.16,ease:'easeInOut'}} style={{width:5,height:5,borderRadius:'50%',background:c.col}}/>
          ))}
        </div>
        {/* Gear in middle */}
        <motion.div animate={{rotate:spin?[0,60]:[0]}} transition={{duration:.35,ease:'easeInOut'}} style={{fontSize:26,filter:'drop-shadow(0 2px 6px rgba(0,0,0,.1))'}}>⚙️</motion.div>
        {/* Arrow dots */}
        <div style={{display:'flex',flexDirection:'column',gap:3.5,alignItems:'center'}}>
          {[0,1,2].map(i=>(
            <motion.div key={i} animate={{x:[0,8,0],opacity:[0,.8,0]}} transition={{duration:.7,repeat:Infinity,delay:.35+i*.16,ease:'easeInOut'}} style={{width:5,height:5,borderRadius:'50%',background:c.col}}/>
          ))}
        </div>
        {/* TO */}
        <motion.div key={ci+'t'} initial={{x:14,opacity:0}} animate={{x:0,opacity:1}} transition={{duration:.3,ease:[.22,1,.36,1]}} style={{textAlign:'center',minWidth:54}}>
          <div style={{fontSize:36,lineHeight:1,marginBottom:5}}>{c.to}</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:800,color:c.col,letterSpacing:.3}}>{c.toL}</div>
        </motion.div>
      </div>
      {/* Conversion pill */}
      <motion.div key={ci+'pill'} initial={{opacity:0,y:5,scale:.94}} animate={{opacity:1,y:0,scale:1}} transition={{delay:.15,type:'spring',stiffness:260,damping:20}}
        style={{background:'rgba(255,255,255,.92)',border:'1.5px solid '+c.col+'40',borderRadius:999,padding:'5px 18px',fontSize:12,fontWeight:700,color:c.col,letterSpacing:.3,boxShadow:'0 2px 10px '+c.col+'18'}}>
        {c.fromL} → {c.toL}
      </motion.div>
      {/* Dot indicators */}
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        {CONVS.map((_,i)=>(
          <motion.div key={i} animate={{scale:i===ci?1:0.7,opacity:i===ci?1:.35}} transition={{duration:.25}}
            style={{width:i===ci?8:5,height:i===ci?8:5,borderRadius:'50%',background:i===ci?c.col:'#ccd0e0'}}/>
        ))}
      </div>
      {/* Lock note */}
      <div style={{fontSize:10,color:'#bbb',fontWeight:600,letterSpacing:.2}}>🔒 100% local · no uploads</div>
    </div>
  </AnimBox>
})

/* COLOR PICKER */
const ColorPickerAnim = memo(()=>{
  const COLS=['#4F8EF7','#E91E63','#9C6FDE','#22c55e','#FF9800','#FF5722']
  const [ci,setCi]=useState(0)
  useEffect(()=>{const id=setInterval(()=>setCi(p=>(p+1)%COLS.length),900);return()=>clearInterval(id)},[])
  const col=COLS[ci]
  return <AnimBox bg="linear-gradient(135deg,#f8f9ff,#fff0fa)" minH={190}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <motion.div animate={{background:col,boxShadow:`0 8px 28px ${col}55`}} transition={{duration:.5}} style={{width:72,height:72,borderRadius:18}}/>
      <motion.div animate={{color:col}} style={{fontFamily:'monospace',fontSize:14,fontWeight:800}}>{col.toUpperCase()}</motion.div>
      <div style={{display:'flex',gap:5}}>
        {COLS.map((c2,i)=>(
          <motion.div key={c2} onClick={()=>setCi(i)}
            animate={{scale:ci===i?1.25:1,boxShadow:ci===i?`0 0 0 2px #fff,0 0 0 4px ${c2}`:''}}
            style={{width:18,height:18,borderRadius:5,background:c2,cursor:'pointer'}}/>
        ))}
      </div>
    </div>
  </AnimBox>
})

/* VIDEO SCREENSHOT — Film strip + live frame flash + progress */
const VideoShotAnim = memo(()=>{
  const [active,setActive] = useState(0)
  const [pct,setPct]       = useState(0)
  const [count,setCount]   = useState(0)
  const COLS = ['#4F8EF7','#9C6FDE','#F06292','#FF9800','#22c55e','#26C6DA','#E91E63','#b94fff']
  useEffect(()=>{
    const t = setInterval(()=>{
      setActive(a=>(a+1)%8)
      setPct(p=>{ const n=p+3; return n>100?0:n })
      setCount(c=>c+1)
    }, 280)
    return()=>clearInterval(t)
  },[])
  return <AnimBox bg="linear-gradient(135deg,#eef2ff,#fdf4ff)" minH={220}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,width:'100%'}}>
      {/* Film strip */}
      <div style={{display:'flex',gap:4,padding:'8px 10px',background:'#1a1a2e',borderRadius:10,boxShadow:'0 4px 18px rgba(0,0,0,.22)'}}>
        {COLS.map((c,i)=>(
          <motion.div key={i}
            animate={{
              scale: active===i ? 1.22 : 1,
              boxShadow: active===i ? `0 0 12px ${c}99` : '0 0 0 transparent',
              background: active===i
                ? `linear-gradient(135deg,${c},${COLS[(i+3)%8]})`
                : `linear-gradient(135deg,${c}33,${COLS[(i+2)%8]}22)`,
            }}
            transition={{duration:.22,type:'spring',stiffness:400,damping:22}}
            style={{width:28,height:36,borderRadius:5,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'4px 3px',cursor:'default'}}>
            <div style={{height:4,background:active===i?'rgba(255,255,255,.7)':'rgba(255,255,255,.15)',borderRadius:2}}/>
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
              {active===i && <motion.div animate={{opacity:[0,1]}} style={{width:14,height:14,borderRadius:3,background:'rgba(255,255,255,.9)'}}/>}
            </div>
            <div style={{height:4,background:active===i?'rgba(255,255,255,.7)':'rgba(255,255,255,.15)',borderRadius:2}}/>
          </motion.div>
        ))}
      </div>
      {/* Progress */}
      <div style={{width:240}}>
        <div style={{height:5,background:'#e5e7ef',borderRadius:3,overflow:'hidden'}}>
          <motion.div animate={{width:`${pct}%`}} transition={{duration:.28}}
            style={{height:'100%',background:'linear-gradient(90deg,#b94fff,#4F8EF7,#00d2ff)',borderRadius:3}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:9.5,fontWeight:700}}>
          <span style={{color:'#aaa'}}>🎬 Extracting frames…</span>
          <span style={{background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{pct}%</span>
        </div>
      </div>
      {/* Format badges */}
      <div style={{display:'flex',gap:6}}>
        {['PNG','JPG','WEBP','ZIP'].map((f,i)=>(
          <motion.span key={f}
            animate={{y:[0,-3,0],opacity:[.7,1,.7]}}
            transition={{duration:1.4,repeat:Infinity,delay:i*.22,ease:'easeInOut'}}
            style={{fontSize:9.5,padding:'3px 9px',borderRadius:999,background:'rgba(79,142,247,.08)',color:'#4F8EF7',fontWeight:800,border:'1px solid rgba(79,142,247,.16)'}}>
            {f}
          </motion.span>
        ))}
      </div>
    </div>
  </AnimBox>
})

/* VIDEO TRANSCRIBER — Waveform + typewriter transcript lines */
const VideoTransAnim = memo(()=>{
  const LINES = ['Extracting audio…','Detecting language: EN','Transcribing speech…','"Hello, welcome to ToolDesk"','Generating subtitles…','✅ Transcript ready!']
  const [li,setLi]       = useState(0)
  const [bars,setBars]   = useState(()=>Array.from({length:18},()=>Math.random()))
  const [typed,setTyped] = useState('')

  useEffect(()=>{
    const barT = setInterval(()=>{
      setBars(Array.from({length:18},()=>0.15+Math.random()*0.85))
    },120)
    const lineT = setInterval(()=>{
      setLi(l=>(l+1)%LINES.length)
      setTyped('')
    },1600)
    return()=>{clearInterval(barT);clearInterval(lineT)}
  },[])

  // Typewriter for current line
  useEffect(()=>{
    const target = LINES[li]
    let i = 0
    setTyped('')
    const t = setInterval(()=>{
      i++
      setTyped(target.slice(0,i))
      if(i>=target.length) clearInterval(t)
    },38)
    return()=>clearInterval(t)
  },[li])

  const isDone = li===5
  const waveColor = isDone ? '#22c55e' : '#4F8EF7'

  return <AnimBox bg="linear-gradient(135deg,#fff5f5,#f0f4ff)" minH={220}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,width:'100%'}}>
      {/* Waveform */}
      <div style={{display:'flex',alignItems:'center',gap:3,height:44,padding:'0 6px'}}>
        {bars.map((h,i)=>(
          <motion.div key={i}
            animate={{scaleY:h, background: isDone
              ? `hsl(${142+i*2},70%,45%)`
              : `hsl(${210+i*3},80%,${55+h*15}%)`}}
            transition={{duration:.12,ease:'linear'}}
            style={{width:6,borderRadius:3,originY:.5,height:40,background:waveColor}}/>
        ))}
      </div>
      {/* Typewriter box */}
      <div style={{background:'rgba(255,255,255,.92)',border:`1px solid ${isDone?'rgba(34,197,94,.25)':'rgba(79,142,247,.18)'}`,borderRadius:12,padding:'10px 20px',minWidth:220,maxWidth:280,textAlign:'center',backdropFilter:'blur(8px)',transition:'border-color .4s'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:.6,marginBottom:4}}>
          {isDone ? '✅ Done' : '⚙️ Processing'}
        </div>
        <div style={{fontSize:12.5,fontWeight:600,color:isDone?'#22c55e':'#4F8EF7',fontFamily:'DM Sans,sans-serif',minHeight:20}}>
          {typed}<motion.span animate={{opacity:[1,0]}} transition={{duration:.6,repeat:Infinity}}>|</motion.span>
        </div>
      </div>
      {/* Export badges */}
      <div style={{display:'flex',gap:5}}>
        {['TXT','SRT','VTT'].map((f,i)=>(
          <motion.span key={f}
            animate={{scale:[1,1.08,1],opacity:[.6,1,.6]}}
            transition={{duration:1.8,repeat:Infinity,delay:i*.5,ease:'easeInOut'}}
            style={{fontSize:9.5,padding:'3px 10px',borderRadius:999,background:'rgba(79,142,247,.08)',color:'#4F8EF7',fontWeight:800,border:'1px solid rgba(79,142,247,.16)'}}>
            {f}
          </motion.span>
        ))}
      </div>
    </div>
  </AnimBox>
})

const BlueprintAnim = memo(()=>{
  const [phase, setPhase] = useState(0) // 0=fetch 1=colors 2=prompt
  const [hue, setHue] = useState(258)
  const sections = ['Header','Hero','Features','Pricing','FAQ','Footer']
  const [lit, setLit] = useState(0)
  useEffect(()=>{
    const tp = setInterval(()=>setPhase(p=>(p+1)%3), 2200)
    const th = setInterval(()=>setHue(h=>(h+.6)%360), 40)
    const tl = setInterval(()=>setLit(l=>(l+1)%sections.length), 400)
    return()=>{ clearInterval(tp); clearInterval(th); clearInterval(tl) }
  },[])
  return <AnimBox bg="linear-gradient(135deg,#f3e8ff,#e8f0ff)" minH={200}>
    <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%'}}>
      {/* Browser bar */}
      <div style={{background:'rgba(255,255,255,.8)',borderRadius:8,padding:'6px 10px',display:'flex',alignItems:'center',gap:6,border:'1px solid rgba(0,0,0,.07)'}}>
        <div style={{display:'flex',gap:3}}>{['#ff5f57','#febc2e','#28c840'].map((c,i)=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:c}}/>)}</div>
        <div style={{flex:1,background:'#f5f5f8',borderRadius:4,padding:'2px 8px',fontSize:9,color:'#aaa',fontFamily:'monospace'}}>analyzing…</div>
        <motion.div animate={{background:[`hsl(${hue},65%,88%)`,`hsl(${hue},75%,82%)`,`hsl(${hue},65%,88%)`]}} transition={{duration:1.4,repeat:Infinity}}
          style={{fontSize:9,fontWeight:700,color:`hsl(${hue},55%,38%)`,borderRadius:4,padding:'2px 6px'}}>🧬</motion.div>
      </div>
      <div style={{display:'flex',gap:8}}>
        {/* Page map */}
        <div style={{display:'flex',flexDirection:'column',gap:3,flex:'0 0 90px'}}>
          {sections.map((s,i)=>(
            <motion.div key={s} animate={{
              background: i===lit ? `hsl(${hue},55%,92%)` : 'rgba(255,255,255,.6)',
              borderColor: i===lit ? `hsl(${hue},55%,72%)` : 'rgba(0,0,0,.07)',
            }} style={{borderRadius:5,padding:'3px 7px',fontSize:9,fontWeight:700,
              color: i===lit ? `hsl(${hue},45%,38%)` : '#bbb',
              border:'1px solid',transition:'all .2s'}}>
              {s}
            </motion.div>
          ))}
        </div>
        {/* AI prompt preview */}
        <div style={{flex:1,background:'rgba(255,255,255,.7)',borderRadius:8,padding:'7px 9px',border:'1px solid rgba(0,0,0,.07)',overflow:'hidden'}}>
          {phase===2 ? (
            <div style={{fontSize:8.5,fontFamily:'monospace',color:'#7C3AED',lineHeight:1.7}}>
              <div style={{fontWeight:700,marginBottom:2}}>✨ AI Recreation Prompt</div>
              <div style={{color:'#888'}}>Build a React + Tailwind</div>
              <div style={{color:'#888'}}>website with: primary</div>
              <motion.div animate={{opacity:[1,.3,1]}} transition={{duration:.8,repeat:Infinity}} style={{color:'#7C3AED',fontWeight:700}}>color: #6366f1 →</motion.div>
            </div>
          ) : phase===1 ? (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{fontSize:8.5,fontWeight:700,color:'#888',marginBottom:2}}>🎨 Colors detected</div>
              {[`hsl(${hue},65%,52%)`,`hsl(${(hue+40)%360},55%,62%)`,`hsl(${(hue+80)%360},50%,72%)`].map((c,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:14,height:14,borderRadius:3,background:c,border:'1px solid rgba(0,0,0,.1)'}}/>
                  <span style={{fontSize:8,fontFamily:'monospace',color:'#aaa'}}>{c.slice(0,16)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <div style={{fontSize:8.5,fontWeight:700,color:'#888',marginBottom:2}}>📋 Blueprint</div>
              {['Design System','Typography','Hero Section','Sections (6)','Conversion'].map((l,i)=>(
                <motion.div key={l} initial={{opacity:0,x:-5}} animate={{opacity:1,x:0}} transition={{delay:i*.08}}
                  style={{fontSize:8,color:'#aaa',display:'flex',alignItems:'center',gap:4}}>
                  <span style={{color:'#22c55e',fontWeight:700}}>✓</span>{l}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </AnimBox>
})

const WebsiteAnim = memo(()=>{
  const bars = [72,88,55,91,64,78,45,82]
  const [tick, setTick] = useState(0)
  useEffect(()=>{
    const id = setInterval(()=>setTick(t=>t+1),1600)
    return ()=>clearInterval(id)
  },[])
  const scores = [
    { label:'SEO',  val: tick%3===0?88:tick%3===1?72:91, color:'#4F8EF7' },
    { label:'SEC',  val: tick%3===0?76:tick%3===1?94:68, color:'#22c55e' },
    { label:'PERF', val: tick%3===0?64:tick%3===1?81:73, color:'#f59e0b' },
  ]
  return (
    <AnimBox>
      {/* Browser chrome */}
      <div style={{background:'#f0f2f8',borderRadius:8,padding:'7px 10px',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
        <div style={{display:'flex',gap:4}}>
          {['#ff5f57','#febc2e','#28c840'].map((c,i)=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:c}}/>)}
        </div>
        <div style={{flex:1,background:'#fff',borderRadius:5,padding:'3px 10px',fontSize:10,color:'#888',fontFamily:'monospace',border:'1px solid rgba(0,0,0,.08)'}}>
          https://example.com
        </div>
        <motion.div animate={{opacity:[1,.4,1]}} transition={{duration:1.2,repeat:Infinity}}
          style={{fontSize:9,fontWeight:700,color:'#4F8EF7',background:'rgba(79,142,247,.1)',borderRadius:4,padding:'2px 6px'}}>
          Analyzing…
        </motion.div>
      </div>
      {/* Score rings row */}
      <div style={{display:'flex',justifyContent:'space-around',marginBottom:10}}>
        {scores.map((s,i)=>{
          const r=18; const circ=2*Math.PI*r; const dash=(s.val/100)*circ
          return (
            <div key={s.label} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
              <div style={{position:'relative',width:46,height:46}}>
                <svg width={46} height={46} style={{transform:'rotate(-90deg)'}}>
                  <circle cx={23} cy={23} r={r} fill="none" stroke="rgba(0,0,0,.07)" strokeWidth={4}/>
                  <motion.circle cx={23} cy={23} r={r} fill="none" stroke={s.color} strokeWidth={4}
                    strokeLinecap="round" strokeDasharray={circ}
                    animate={{strokeDashoffset: circ - dash}}
                    transition={{duration:.8,delay:i*.15,ease:[.22,1,.36,1]}}
                    initial={{strokeDashoffset:circ}}/>
                </svg>
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                  fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:11,color:s.color}}>{s.val}</div>
              </div>
              <span style={{fontSize:9,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.4px'}}>{s.label}</span>
            </div>
          )
        })}
      </div>
      {/* Bar chart */}
      <div style={{display:'flex',alignItems:'flex-end',gap:4,height:34,padding:'0 4px'}}>
        {bars.map((h,i)=>(
          <motion.div key={i}
            animate={{height:`${tick%2===0?h:Math.min(100,h+Math.floor((i*7)%20))}%`}}
            transition={{duration:.7,delay:i*.05,ease:[.22,1,.36,1]}}
            style={{flex:1,borderRadius:'3px 3px 0 0',
              background:`linear-gradient(180deg,${i%3===0?'#4F8EF7':i%3===1?'#9C6FDE':'#22c55e'},rgba(79,142,247,.3))`,
              minHeight:3}}/>
        ))}
      </div>
      {/* Tags */}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:8}}>
        {['React','HTTPS','OG Tags'].map(t=>(
          <span key={t} style={{fontSize:9,padding:'2px 7px',borderRadius:999,fontWeight:700,
            background:'rgba(79,142,247,.1)',color:'#4F8EF7',border:'1px solid rgba(79,142,247,.18)'}}>{t}</span>
        ))}
        <span style={{fontSize:9,padding:'2px 7px',borderRadius:999,fontWeight:700,
          background:'rgba(34,197,94,.1)',color:'#15803d',border:'1px solid rgba(34,197,94,.18)'}}>✓ Secure</span>
      </div>
    </AnimBox>
  )
})


/* ── TRANSLATOR ── */
const TranslatorAnim = memo(() => {
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState(0)
  const PAIRS = [
    { from:'Good morning', to:'Buenos días',   flag1:'🇺🇸', flag2:'🇪🇸', c:'#ef4444' },
    { from:'Thank you',    to:'Merci',          flag1:'🇺🇸', flag2:'🇫🇷', c:'#3b82f6' },
    { from:'How are you?', to:'お元気ですか？',  flag1:'🇺🇸', flag2:'🇯🇵', c:'#f97316' },
    { from:'Beautiful',    to:'美丽',            flag1:'🇺🇸', flag2:'🇨🇳', c:'#22c55e' },
  ]
  useEffect(() => {
    const id = setInterval(() => { setStep(s => (s+1) % PAIRS.length); setTyping(0) }, 2400)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const word = PAIRS[step].to
    if (typing >= word.length) return
    const id = setTimeout(() => setTyping(t => t+1), 65)
    return () => clearTimeout(id)
  }, [typing, step])
  const p = PAIRS[step]
  return <AnimBox bg="linear-gradient(135deg,#eef4ff,#f0f9ff)" minH={210}>
    <div style={{ width:'100%', maxWidth:280 }}>
      <div style={{ background:'#fff', borderRadius:12, padding:'10px 14px', marginBottom:8,
        border:'1px solid rgba(0,0,0,.08)', boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
          <span style={{ fontSize:16 }}>{p.flag1}</span>
          <span style={{ fontSize:10, fontWeight:700, color:'#aaa', textTransform:'uppercase' }}>English</span>
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:'#333' }}>{p.from}</div>
      </div>
      <motion.div animate={{ y:[0,3,0] }} transition={{ duration:.8, repeat:Infinity }}
        style={{ textAlign:'center', fontSize:18, color:'#4F8EF7', marginBottom:8 }}>⬇</motion.div>
      <motion.div key={step} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
        style={{ background:`${p.c}12`, borderRadius:12, padding:'10px 14px', border:`1.5px solid ${p.c}30` }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
          <span style={{ fontSize:16 }}>{p.flag2}</span>
          <span style={{ fontSize:10, fontWeight:700, color:p.c, textTransform:'uppercase' }}>Translation</span>
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:p.c, minHeight:22 }}>
          {p.to.slice(0, typing)}
          <motion.span animate={{ opacity:[1,0] }} transition={{ duration:.5, repeat:Infinity }}>|</motion.span>
        </div>
      </motion.div>
      <div style={{ display:'flex', gap:4, justifyContent:'center', marginTop:10 }}>
        {PAIRS.map((_,i) => (
          <motion.div key={i} animate={{ scale:i===step?1.4:1, background:i===step?p.c:'#e0e0ee' }}
            style={{ width:6, height:6, borderRadius:'50%', background:'#e0e0ee' }}/>
        ))}
      </div>
    </div>
  </AnimBox>
})

/* ── QR CODE ── */
const QRCodeAnim = memo(() => {
  const [phase, setPhase] = useState(0)
  const [scanY, setScanY] = useState(0)
  useEffect(() => { const id = setInterval(() => setPhase(p => (p+1)%3), 2000); return () => clearInterval(id) }, [])
  useEffect(() => { const id = setInterval(() => setScanY(y => (y+3)%110), 22); return () => clearInterval(id) }, [])
  const QR = [1,1,1,0,1,1,1,0,0,0,0,0,0,0,1,1,1,0,1,1,1,1,0,1,0,0,1,0,1,0,1,0,1,0,1,1,0,1,0,0,0,1,1,0,1,0,1,0,1,0,1,1,1,0,0,0,1,1,1,0,0,0,1,1,0,0,0,1,0,1,0,1,0,1,0,0,0,0,1,0,0,0,0,1,1,1,0,0,0,1,0,1,0,0,1,0,1,0,0,1,0,1,0,1,0,1,0,0,0,0,1,0,0,1,1,0,1,1,0,1,1,1,0,1,0,0,1,1,1,0,0,0,0,1,0,0,1,0,1,1,1,0,1,0,0,1,0,1,0,1]
  const COLORS = ['#0d0d1a','#4F8EF7','#9C6FDE']
  const MODES = ['URL Mode','WiFi Mode','vCard Mode']
  return <AnimBox bg="linear-gradient(135deg,#eef4ff,#f0f9ff)" minH={210}>
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
      <div style={{ background:'#fff', padding:10, borderRadius:14, boxShadow:'0 8px 28px rgba(0,0,0,.12)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', left:10, right:10, top:`${scanY/110*100}%`, height:2,
          background:'linear-gradient(90deg,transparent,#4F8EF7,transparent)', zIndex:2,
          borderRadius:1, boxShadow:'0 0 8px rgba(79,142,247,.5)' }}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:1.5, width:108, height:108 }}>
          {QR.slice(0,144).map((on, i) => (
            <div key={i} style={{ background:on ? COLORS[phase%COLORS.length] : '#f5f5f8',
              borderRadius:1.5, width:'100%', aspectRatio:'1', transition:'background .6s ease' }}/>
          ))}
        </div>
      </div>
      <motion.div animate={{ color:COLORS[phase%COLORS.length] }}
        style={{ fontSize:11, fontWeight:700 }}>{MODES[phase]}</motion.div>
    </div>
  </AnimBox>
})

/* ── BREACH CHECKER ── */
const BreachAnim = memo(() => {
  const [phase, setPhase] = useState(0)
  const [count, setCount] = useState(0)
  const PHASES = [
    { icon:'📧', label:'Enter email to check', color:'#4F8EF7', bg:'rgba(79,142,247,.08)' },
    { icon:'🔍', label:'Scanning 847 breaches…', color:'#f97316', bg:'rgba(249,115,22,.08)' },
    { icon:'✅', label:'No breaches found!', color:'#22c55e', bg:'rgba(34,197,94,.08)' },
    { icon:'⚠️', label:'3 breaches detected!', color:'#ef4444', bg:'rgba(239,68,68,.08)' },
  ]
  useEffect(() => { const id = setInterval(() => setPhase(p => (p+1)%PHASES.length), 1900); return () => clearInterval(id) }, [])
  useEffect(() => {
    if (phase!==1){setCount(0);return}
    const id = setInterval(() => setCount(c => c<847?c+Math.floor(Math.random()*55+25):847), 80)
    return () => clearInterval(id)
  }, [phase])
  const p = PHASES[phase]
  return <AnimBox bg="linear-gradient(135deg,#f8faff,#fff5f5)" minH={210}>
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, width:'100%' }}>
      <motion.div key={phase} initial={{ scale:.6, opacity:0 }} animate={{ scale:1, opacity:1 }}
        transition={{ type:'spring', stiffness:400, damping:20 }} style={{ fontSize:44 }}>{p.icon}</motion.div>
      <div style={{ width:160, padding:'12px 16px', borderRadius:14, background:p.bg,
        border:`1.5px solid ${p.color}25`, textAlign:'center' }}>
        <motion.div key={phase} initial={{ opacity:0 }} animate={{ opacity:1 }}
          style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.label}</motion.div>
        {phase===1 && (
          <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:800, color:'#f97316', marginTop:6 }}>
            {count.toLocaleString()}
          </div>
        )}
      </div>
      {phase===1 && (
        <div style={{ width:140, height:4, background:'#f0f0f5', borderRadius:2, overflow:'hidden' }}>
          <motion.div animate={{ width:['0%','100%'] }}
            transition={{ duration:1.9, ease:'easeInOut', repeat:Infinity }}
            style={{ height:'100%', background:'linear-gradient(90deg,#f97316,#ef4444)', borderRadius:2 }}/>
        </div>
      )}
    </div>
  </AnimBox>
})

/* ── IP LOOKUP ── */
const IPLookupAnim = memo(() => {
  const [ipIdx, setIpIdx] = useState(0)
  const IPS  = ['142.250.80.14','104.21.56.1','151.101.1.57','13.107.42.14']
  const LOCS = ['🇺🇸 Mountain View, US','🇩🇪 Frankfurt, DE','🇬🇧 London, UK','🇮🇪 Dublin, IE']
  const ISPS = ['Google LLC','Cloudflare Inc.','Fastly Inc.','Microsoft Corp.']
  useEffect(() => { const id = setInterval(() => setIpIdx(i => (i+1)%IPS.length), 2000); return () => clearInterval(id) }, [])
  return <AnimBox bg="linear-gradient(135deg,#eef4ff,#f0fbff)" minH={210}>
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, width:'100%' }}>
      <div style={{ position:'relative', width:80, height:80, marginBottom:4 }}>
        {[0,1,2].map(i => (
          <motion.div key={i} animate={{ scale:[.3,2.2], opacity:[.8,0] }}
            transition={{ duration:1.8, delay:i*.6, repeat:Infinity, ease:'easeOut' }}
            style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid #4F8EF7' }}/>
        ))}
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:26 }}>📡</div>
      </div>
      <motion.div key={ipIdx} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
        style={{ background:'#fff', borderRadius:11, padding:'9px 14px', width:'100%',
          border:'1px solid rgba(79,142,247,.2)', boxShadow:'0 2px 10px rgba(79,142,247,.1)' }}>
        <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:800, color:'#0d0d1a', marginBottom:3 }}>{IPS[ipIdx]}</div>
        <div style={{ fontSize:11, color:'#4F8EF7', fontWeight:600 }}>{LOCS[ipIdx]}</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginTop:2 }}>{ISPS[ipIdx]}</div>
      </motion.div>
    </div>
  </AnimBox>
})

const SystemInfoAnim = memo(()=>{
  const [step, setStep] = useState(0)
  const steps = [
    { icon: '💻', text: 'Analyzing Hardware Cores & OS...', color: '#4F8EF7' },
    { icon: '🛡️', text: 'Auditing Browser Cookies & Secure Context...', color: '#9C6FDE' },
    { icon: '🚫', text: 'Scanning for Active Ad-Blockers...', color: '#ef4444' },
    { icon: '🎮', text: 'Extracting WebGL GPU Fingerprints...', color: '#22c55e' }
  ]
  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % steps.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])
  const current = steps[step]
  return (
    <AnimBox bg="linear-gradient(135deg,#f0f4ff,#fafbff)" minH={200}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
        <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: `2px solid ${current.color}` }}
          />
          <motion.div
            key={step}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: 36, zIndex: 2 }}
          >
            {current.icon}
          </motion.div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: 14, fontWeight: 700, color: '#333', fontFamily: 'Syne, sans-serif' }}
          >
            {current.text}
          </motion.div>
          <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.8px', marginTop: 4 }}>
            System Audit Scanner Active
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i === step ? current.color : '#e0e0e8',
                transition: 'background .3s'
              }}
            />
          ))}
        </div>
      </div>
    </AnimBox>
  )
})


const CountryFinderAnim = memo(() => {
  const [cIdx, setCIdx] = useState(0)
  const COUNTRIES = [
    { flag: '🇺🇸', name: 'United States', code: 'USA', pop: '331.9M', share: '4.14%' },
    { flag: '🇮🇳', name: 'India', code: 'IND', pop: '1.408B', share: '17.75%' },
    { flag: '🇯🇵', name: 'Japan', code: 'JPN', pop: '125.8M', share: '1.56%' },
    { flag: '🇧🇷', name: 'Brazil', code: 'BRA', pop: '212.6M', share: '2.64%' }
  ]
  useEffect(() => {
    const id = setInterval(() => setCIdx(c => (c + 1) % COUNTRIES.length), 2200)
    return () => clearInterval(id)
  }, [])
  const current = COUNTRIES[cIdx]

  return (
    <AnimBox bg="linear-gradient(135deg,#f5f7ff,#fbf0ff)" minH={210}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* Globe Spinning Orbit */}
        <div style={{ position: 'relative', width: 70, height: 70 }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute', inset: -8, borderRadius: '50%',
              border: '1.5px dashed rgba(79,142,247,.4)'
            }}
          />
          <div style={{
            position: 'absolute', inset: 0, background: '#fff', borderRadius: '50%',
            boxShadow: '0 6px 18px rgba(79,142,247,.18)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 34
          }}>
            🌍
          </div>
        </div>

        {/* Dynamic Country Pill */}
        <motion.div
          key={cIdx}
          initial={{ opacity: 0, scale: 0.95, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          style={{
            background: '#fff', borderRadius: 14, padding: '10px 18px',
            border: '1.5px solid rgba(156,111,222,.2)', boxShadow: '0 4px 16px rgba(156,111,222,.08)',
            textAlign: 'center', display: 'flex', alignItems: 'center', gap: 10
          }}
        >
          <span style={{ fontSize: 26 }}>{current.flag}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0d0d1a' }}>{current.name}</div>
            <div style={{ fontSize: 10.5, color: '#888', fontWeight: 600 }}>
              Pop: {current.pop} · Share: {current.share}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimBox>
  )
})


const MAP = {
  password:PassAnim, wordcount:WordAnim, textcase:TCaseAnim, units:UnitAnim,
  currency:CurrAnim, gradient:GradAnim, quote:QuoteAnim, favicon:FavAnim,
  thumbnail:ThumbAnim, imgresizer:ImgResAnim, imgcompress:ImgCompAnim,
  imgconvert:ImgConvAnim, bgremove:BGRemAnim, pdf:PDFAnim,
  aspectratio:AspectAnim, vault:VaultAnim,
  imgborder:ImageToolsAnim, roundcorner:ImageToolsAnim, imagetools:ImageToolsAnim,
  wordreplace:WordReplaceAnim,
  randname:RandNameAnim, randaddress:RandAddrAnim,
  bcrypt:BcryptAnim, fileconvert:FileConvAnim,
  colorpicker:ColorPickerAnim,
  videoscreenshot:VideoShotAnim, videotranscriber:VideoTransAnim,
  websiteanalyzer:WebsiteAnim,
  translator:TranslatorAnim, qrcode:QRCodeAnim, breachcheck:BreachAnim,
  iplookup:IPLookupAnim, systeminfo:SystemInfoAnim,
  countryfinder:CountryFinderAnim,
}

export default function ToolAnimation({ toolId }) {
  const Anim = MAP[toolId]
  const containerRef = useRef(null)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting && !document.hidden)
    }, { rootMargin: '120px 0px 120px 0px' })

    observer.observe(el)

    const handleVis = () => {
      if (document.hidden) {
        setIsVisible(false)
      } else if (el) {
        const rect = el.getBoundingClientRect()
        const inView = rect.bottom > -120 && rect.top < window.innerHeight + 120
        setIsVisible(inView)
      }
    }

    document.addEventListener('visibilitychange', handleVis)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [])

  if (!Anim) return null

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity:0, y:10 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:.46, delay:.2, ease:[.22,1,.36,1] }}
      style={{
        marginBottom:20,
        borderRadius:16,
        overflow:'hidden',
        boxShadow:'0 6px 24px rgba(0,0,0,.07)',
        border:'1px solid rgba(0,0,0,.06)',
        minHeight:200,
        contain:'layout style',
      }}
    >
      {isVisible ? <Anim/> : <div style={{ minHeight:200, background:'#F5F7FF' }}/>}
    </motion.div>
  )
}
