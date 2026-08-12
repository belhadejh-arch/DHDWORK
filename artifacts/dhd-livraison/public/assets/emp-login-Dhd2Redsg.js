import{r as a,e as C,j as e}from"./vendor-react-C5hoFxUC.js";import{u as X,ar as B,a as O,b as $,c as D,l as H,B as d,A as k}from"./index-DYVlzey9.js";import{u as z}from"./useQrCamera-CmKKbiV4.js";import"./vendor-query-BeEmy_aA.js";import"./vendor-radix-CvRamAWb.js";import"./vendor-charts-BpXFriVA.js";import"./vendor-icons-DjWppej9.js";import"./vendor-qr-B_u5thmL.js";import"./input-CRBpg2or.js";
const UI={
  orange:"#F58220",orangeDark:"#C25400",orangeDeep:"#D65E00",
  grad:"linear-gradient(140deg,#F58220 0%,#E86A00 60%,#D65E00 100%)",
  headGrad:"linear-gradient(150deg,#FF9C3F 0%,#F58220 55%,#E06A00 100%)"
};
const css=`
@keyframes dhdFadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes dhdFadeIn{from{opacity:0}to{opacity:1}}
.dhd-login-card{animation:dhdFadeUp .45s cubic-bezier(.22,.8,.35,1) both}
.dhd-login-logo{animation:dhdFadeIn .6s ease .1s both}
.dhd-tab-btn{transition:background-color .18s ease,color .18s ease,box-shadow .18s ease}
.dhd-input:focus{outline:none;border-color:${UI.orange}!important;box-shadow:0 0 0 3px rgba(245,130,32,.18)!important}
.dhd-cta{transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
.dhd-cta:not(:disabled):hover{filter:brightness(1.05);box-shadow:0 10px 24px -8px rgba(232,106,0,.55)}
.dhd-cta:not(:disabled):active{transform:translateY(1px) scale(.99)}
.dhd-ghost{transition:color .15s ease}
.dhd-ghost:hover{color:${UI.orangeDark}}
@media (max-width:420px){.dhd-login-shell{padding-left:12px!important;padding-right:12px!important}}
`;
function EyeIcon(t){return t.off
  ? e.jsxs("svg",{width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"}),e.jsx("path",{d:"M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"}),e.jsx("path",{d:"M14.12 14.12a3 3 0 1 1-4.24-4.24"}),e.jsx("line",{x1:1,y1:1,x2:23,y2:23})]})
  : e.jsxs("svg",{width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"}),e.jsx("circle",{cx:12,cy:12,r:3})]})}
function HashIcon(){return e.jsxs("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("line",{x1:4,y1:9,x2:20,y2:9}),e.jsx("line",{x1:4,y1:15,x2:20,y2:15}),e.jsx("line",{x1:10,y1:3,x2:8,y2:21}),e.jsx("line",{x1:16,y1:3,x2:14,y2:21})]})}
function QrGlyph(t){return e.jsx("svg",{className:t.className,width:t.size||38,height:t.size||38,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M3 9V6a1 1 0 011-1h3M3 15v3a1 1 0 001 1h3m11-4v3a1 1 0 01-1 1h-3m4-11h-3a1 1 0 01-1-1V5M7 7h4v4H7V7zm6 6h4v4h-4v-4zm0-6h.01M13 17h.01"})})}
function ee(){const{t:E}=X(),{login:T,isAuthenticated:b}=B(),{login:A}=O(),[,g]=$(),{toast:m}=D(),[l,R]=a.useState("serial"),[u,I]=a.useState(""),[c,x]=a.useState(!1),[i,r]=a.useState(!1),[h,f]=a.useState("idle"),[L,p]=a.useState(""),[G,W]=a.useState(!1),y=a.useRef(null),N=a.useRef(null);
C.useEffect(()=>{b&&g("/portal")},[b,g]),C.useEffect(()=>{l!=="qr"&&r(!1)},[l]);
const w=t=>{t.userType==="admin"?A(t.admin,t.token):T(t.employee,t.token)},
M=async t=>{x(!0);const n=new AbortController,j=setTimeout(()=>n.abort(),15e3);try{const s=await fetch(`${k}/auth/login/qr`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({qrCodeData:t}),signal:n.signal}),o=await s.json();if(!s.ok){m({variant:"destructive",title:s.status===403?"الحساب موقوف أو غير نشط":"رمز QR غير صالح أو منتهي الصلاحية"}),r(!1),setTimeout(()=>r(!0),400);return}r(!1),w(o)}catch(s){const o=s instanceof Error&&s.name==="AbortError";m({variant:"destructive",title:o?"انتهت مهلة الاتصال، حاول مجدداً":"فشل الاتصال بالخادم، حاول مجدداً"}),r(!1),setTimeout(()=>r(!0),400)}finally{clearTimeout(j),x(!1)}},
{stopCamera:Q}=z({videoRef:y,canvasRef:N,active:i,onScan:M,onError:t=>{p(t)},onStatus:t=>{f(t)}}),
S=()=>{p(""),f("starting"),r(!0)},
v=()=>{Q(),r(!1),f("idle"),p("")},
q=t=>{v(),R(t)},
P=async t=>{if(t.preventDefault(),!u.trim())return;x(!0);const n=new AbortController,j=setTimeout(()=>n.abort(),15e3);try{const s=await fetch(`${k}/auth/login/serial`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({serialNumber:u.trim()}),signal:n.signal}),o=await s.json();if(!s.ok){m({variant:"destructive",title:s.status===403?"الحساب موقوف":"الرقم التسلسلي غير صحيح"});return}w(o)}catch(s){const o=s instanceof Error&&s.name==="AbortError";m({variant:"destructive",title:o?"انتهت مهلة الاتصال، حاول مجدداً":"حدث خطأ، حاول مجدداً"})}finally{clearTimeout(j),x(!1)}};
const inputBase={width:"100%",height:48,borderRadius:14,border:"1.5px solid #E7E2DB",background:"#FAF8F5",fontSize:16,transition:"border-color .15s ease, box-shadow .15s ease",color:"#2B2620"};
const tabs=[{id:"serial",label:"الرقم التسلسلي"},{id:"qr",label:"رمز QR"}];
return e.jsxs("div",{className:"dhd-login-shell min-h-screen w-full flex flex-col items-center justify-center px-4 py-10",style:{background:UI.grad},children:[
  e.jsx("style",{children:css}),
  e.jsxs("div",{className:"dhd-login-card w-full",style:{maxWidth:420,background:"#fff",borderRadius:28,boxShadow:"0 24px 60px -18px rgba(120,53,0,.35), 0 4px 16px rgba(120,53,0,.12)",overflow:"hidden"},children:[
    e.jsxs("div",{style:{position:"relative",background:UI.headGrad,paddingTop:34,paddingBottom:56},children:[
      e.jsx("div",{className:"dhd-login-logo",style:{display:"flex",justifyContent:"center"},children:
        e.jsx("div",{style:{background:"#fff",borderRadius:20,padding:"14px 26px",boxShadow:"0 10px 30px -8px rgba(0,0,0,.28)"},children:
          e.jsx("img",{src:H,alt:"DHD Livraison",style:{height:64,objectFit:"contain",display:"block"}})})}),
      e.jsx("svg",{viewBox:"0 0 420 44",preserveAspectRatio:"none",style:{position:"absolute",bottom:-1,left:0,width:"100%",height:44,display:"block"},children:
        e.jsx("path",{d:"M0,22 C90,52 180,-8 260,14 C330,32 380,10 420,26 L420,44 L0,44 Z",fill:"#fff"})})]}),
    e.jsxs("div",{style:{padding:"18px 26px 26px"},children:[
      e.jsxs("div",{style:{textAlign:"center",marginBottom:18},children:[
        e.jsxs("h1",{style:{fontSize:24,fontWeight:700,color:"#241E17",margin:0},children:["مرحباً بك"," ",e.jsx("span",{style:{color:UI.orange},children:"!"})]}),
        e.jsx("p",{style:{fontSize:13.5,color:"#8A8177",marginTop:4},children:"سجّل دخولك إلى حساب الموظف"})]}),
      e.jsx("div",{role:"tablist","aria-label":"طريقة تسجيل الدخول",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,background:"#F4F0EA",borderRadius:999,padding:5,marginBottom:20},children:
        tabs.map(t=>e.jsx("button",{type:"button",role:"tab","aria-selected":l===t.id,onClick:()=>q(t.id),className:"dhd-tab-btn",style:{height:40,borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,background:l===t.id?"#fff":"transparent",color:l===t.id?UI.orangeDark:"#95897B",boxShadow:l===t.id?"0 3px 10px rgba(120,53,0,.14)":"none"},children:t.label},t.id))}),
      l==="serial"&&e.jsxs("form",{onSubmit:P,style:{display:"flex",flexDirection:"column",gap:16},children:[
        e.jsxs("div",{children:[
          e.jsx("label",{htmlFor:"dhd-serial-input",style:{display:"block",fontSize:13.5,fontWeight:600,color:"#4A4238",marginBottom:8},children:"الرقم التسلسلي"}),
          e.jsxs("div",{style:{position:"relative"},children:[
            e.jsx("span",{style:{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#BBAE9E",display:"flex"},children:e.jsx(HashIcon,{})}),
            e.jsx("input",{id:"dhd-serial-input",type:G?"text":"password",inputMode:"text",autoComplete:"off",placeholder:"EMP-XXXXXX",value:u,onChange:t=>I(t.target.value.toUpperCase()),autoFocus:!0,dir:"ltr",className:"dhd-input",style:{...inputBase,textAlign:"center",fontFamily:G?"ui-monospace,Menlo,monospace":"inherit",letterSpacing:G?"0.18em":"0.28em",padding:"0 46px"}}),
            e.jsx("button",{type:"button",onClick:()=>W(t=>!t),"aria-label":G?"إخفاء الرقم":"إظهار الرقم",style:{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",border:"none",background:"transparent",cursor:"pointer",color:"#9A8D7E",display:"flex",padding:4},children:e.jsx(EyeIcon,{off:!G})})]}),
          e.jsx("p",{style:{fontSize:12,color:"#9A9186",textAlign:"center",marginTop:8},children:"أدخل الرقم التسلسلي الخاص بك"})]}),
        e.jsx("button",{type:"submit",disabled:c||!u.trim(),className:"dhd-cta",style:{height:50,borderRadius:999,border:"none",cursor:c||!u.trim()?"default":"pointer",fontFamily:"inherit",fontSize:16,fontWeight:700,color:"#fff",background:c||!u.trim()?"#F0B27F":UI.grad,boxShadow:"0 8px 20px -6px rgba(232,106,0,.5)"},children:c?"جارٍ التحقق...":"تسجيل الدخول"})]}),
      l==="qr"&&e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16},children:[
        e.jsx("video",{ref:y,playsInline:!0,muted:!0,autoPlay:!0,className:`w-full ${i&&h==="scanning"?"block":"hidden"}`,style:{maxHeight:300,borderRadius:18,objectFit:"cover",border:"3px solid "+UI.orange}}),
        e.jsx("canvas",{ref:N,className:"hidden"}),
        !i&&e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"6px 0"},children:[
          e.jsx("div",{style:{width:84,height:84,borderRadius:22,background:"linear-gradient(150deg,#FFF3E6,#FFE3C7)",display:"flex",alignItems:"center",justifyContent:"center",color:UI.orangeDark,boxShadow:"inset 0 0 0 1.5px rgba(245,130,32,.25)"},children:e.jsx(QrGlyph,{size:40})}),
          e.jsxs("p",{style:{fontSize:13.5,color:"#8A8177",textAlign:"center",lineHeight:1.7,margin:0},children:["امسح رمز QR الخاص بك",e.jsx("br",{}),"لتسجيل الدخول تلقائياً"]}),
          e.jsx("button",{type:"button",onClick:S,disabled:c,className:"dhd-cta",style:{width:"100%",height:50,borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:16,fontWeight:700,color:"#fff",background:UI.grad,boxShadow:"0 8px 20px -6px rgba(232,106,0,.5)"},children:"فتح الكاميرا"})]}),
        i&&h==="starting"&&e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"16px 0"},children:[
          e.jsx("div",{className:"animate-spin",style:{height:34,width:34,border:"3px solid "+UI.orange,borderTopColor:"transparent",borderRadius:"50%"}}),
          e.jsx("p",{style:{fontSize:13.5,color:"#8A8177"},children:"جارٍ تشغيل الكاميرا…"})]}),
        i&&h==="scanning"&&e.jsxs(e.Fragment,{children:[
          e.jsx("p",{style:{fontSize:13.5,color:"#8A8177",textAlign:"center"},children:c?"جارٍ التحقق من الرمز...":"وجّه الكاميرا نحو رمز QR"}),
          e.jsx(d,{variant:"outline",className:"w-full h-11",onClick:v,disabled:c,children:"إلغاء"})]}),
        i&&h==="error"&&e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12},children:[
          e.jsx("div",{style:{background:"#FEF1F1",border:"1px solid #F6C6C6",borderRadius:16,padding:16},children:
            e.jsx("p",{style:{color:"#C0392B",fontSize:13.5,lineHeight:1.7,textAlign:"center",margin:0},children:L})}),
          e.jsx(d,{variant:"outline",className:"w-full",onClick:S,children:"إعادة المحاولة"}),
          e.jsx(d,{variant:"ghost",className:"w-full",onClick:v,children:"إلغاء"})]})]})]})]}),
  e.jsx("p",{style:{textAlign:"center",fontSize:12.5,marginTop:18},children:
    e.jsx("a",{href:"/",className:"dhd-ghost",style:{color:"rgba(255,255,255,.85)",textDecoration:"none"},children:E("emp.login.admin_link")})})]})}
export{ee as default};
