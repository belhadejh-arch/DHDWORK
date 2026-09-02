import{r as React,j as jsx}from"./vendor-react-C5hoFxUC.js";

const apiHeaders=()=>{const token=window.localStorage.getItem("dhd_admin_token");return token?{Authorization:`Bearer ${token}`}:{}};

function formatDate(value){
  if(!value)return"الآن";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"الآن":new Intl.DateTimeFormat("ar-DZ",{dateStyle:"medium",timeStyle:"short"}).format(date);
}

function Notifications(){
  const[list,setList]=React.useState([]);
  const[unreadOnly,setUnreadOnly]=React.useState(false);
  const[loading,setLoading]=React.useState(true);
  const[busy,setBusy]=React.useState(null);
  const load=React.useCallback(async()=>{
    try{
      const response=await fetch("/api/notifications",{credentials:"include",headers:{Accept:"application/json",...apiHeaders()}});
      if(response.ok){
        const data=await response.json();
        setList(Array.isArray(data)?data:[]);
      }
    }finally{setLoading(false)}
  },[]);
  React.useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(),5000);
    return()=>window.clearInterval(timer);
  },[load]);
  const update=async(id,action)=>{
    setBusy(`${action}-${id}`);
    try{
      const response=await fetch(`/api/notifications/${id}${action==="read"?"/read":""}`,{
        method:action==="read"?"POST":"DELETE",credentials:"include",headers:apiHeaders()
      });
      if(!response.ok)return false;
      if(action==="delete")setList(items=>items.filter(item=>item.id!==id));
      else setList(items=>items.map(item=>item.id===id?{...item,isRead:true}:item));
      return true;
    }finally{setBusy(null)}
  };
  const markAll=async()=>{
    if(!list.some(item=>!item.isRead))return;
    setBusy("all");
    try{
      const response=await fetch("/api/notifications/read-all",{method:"POST",credentials:"include",headers:apiHeaders()});
      if(response.ok)setList(items=>items.map(item=>({...item,isRead:true})));
    }finally{setBusy(null)}
  };
  const deleteAll=async()=>{
    if(!list.length)return;
    setBusy("all-delete");
    try{
      const response=await fetch("/api/notifications",{method:"DELETE",credentials:"include",headers:apiHeaders()});
      if(response.ok)setList([]);
    }finally{setBusy(null)}
  };
  const open=async(item)=>{
    const marked=item.isRead||await update(item.id,"read");
    if(marked)window.location.assign(item.targetPath||"/dashboard");
  };
  const visible=unreadOnly?list.filter(item=>!item.isRead):list;
  const unread=list.filter(item=>!item.isRead).length;
  return jsx.jsxs("div",{className:"space-y-6 max-w-4xl mx-auto",children:[
    jsx.jsxs("div",{className:"flex justify-between items-center gap-4",children:[
      jsx.jsxs("div",{children:[jsx.jsx("h1",{className:"text-3xl font-bold tracking-tight",children:"الإشعارات"}),jsx.jsx("p",{className:"text-muted-foreground mt-1",children:"تابع التنبيهات المرتبطة بسجلات النظام"})]}),
      jsx.jsxs("div",{className:"flex flex-wrap gap-2",children:[
        jsx.jsx("button",{type:"button",className:"inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50",onClick:markAll,disabled:busy==="all"||!unread,children:["✓ ","تحديد الكل كمقروء"]}),
        jsx.jsx("button",{type:"button",className:"inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50",onClick:deleteAll,disabled:busy==="all-delete"||!list.length,children:["🗑 ","حذف صندوق الإشعارات"]})
      ]})
    ]}),
    jsx.jsxs("div",{className:"flex gap-2 mb-4",children:[
      jsx.jsx("button",{type:"button",className:`rounded-md px-3 py-2 text-sm ${!unreadOnly?"bg-primary text-primary-foreground":"bg-muted"}`,onClick:()=>setUnreadOnly(false),children:"كل الإشعارات"}),
      jsx.jsx("button",{type:"button",className:`rounded-md px-3 py-2 text-sm ${unreadOnly?"bg-primary text-primary-foreground":"bg-muted"}`,onClick:()=>setUnreadOnly(true),children:`غير المقروءة (${unread})`})
    ]}),
    jsx.jsx("div",{className:"rounded-xl border bg-card shadow-sm overflow-hidden",children:
      loading?jsx.jsx("div",{className:"p-8 text-center text-muted-foreground",children:"جارٍ تحميل الإشعارات..."}):
      visible.length===0?jsx.jsx("div",{className:"p-12 text-center text-muted-foreground",children:"لا توجد إشعارات."}):
      jsx.jsx("div",{className:"divide-y",children:visible.map(item=>jsx.jsxs("article",{
        className:`p-4 flex gap-3 items-start cursor-pointer transition-colors ${item.isRead?"bg-emerald-50/50 hover:bg-emerald-50":"bg-red-50 hover:bg-red-100"}`,
        onClick:()=>void open(item),
        children:[
          jsx.jsx("span",{className:`mt-2 h-2.5 w-2.5 rounded-full flex-shrink-0 ${item.isRead?"bg-emerald-500":"bg-red-500"}`,children:""}),
          jsx.jsxs("div",{className:"flex-1 min-w-0",children:[
            jsx.jsx("p",{className:`text-sm ${item.isRead?"text-emerald-800":"font-semibold text-red-800"}`,children:item.message||"إشعار جديد"}),
            jsx.jsx("p",{className:"text-xs text-muted-foreground mt-1",children:formatDate(item.createdAt)}),
              jsx.jsxs("div",{className:"flex flex-wrap gap-3 items-center mt-2",children:[
              jsx.jsx("span",{className:`text-xs font-medium ${item.isRead?"text-emerald-700":"text-red-700"}`,children:item.isRead?"مقروء":"غير مقروء"}),
              !item.isRead&&jsx.jsx("button",{type:"button",className:"text-xs font-medium text-emerald-700 hover:underline",onClick:event=>{event.stopPropagation();void update(item.id,"read")},children:"تحديد كمقروء"}),
              jsx.jsx("span",{className:"text-xs text-primary hover:underline",children:"عرض السجل المرتبط"})
            ]})
          ]}),
          jsx.jsx("button",{type:"button",className:"rounded-md p-2 text-muted-foreground hover:text-red-600 hover:bg-red-100",title:"حذف الإشعار",disabled:busy===`delete-${item.id}`,onClick:event=>{event.stopPropagation();void update(item.id,"delete")},children:"🗑"})
        ]
      },item.id))})
    })
  ]});
}

export default Notifications;