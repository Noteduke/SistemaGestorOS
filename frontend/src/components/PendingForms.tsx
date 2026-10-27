import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormHTMLAttributes, type ReactNode, type RefObject } from "react";
type Pending = { save?: () => void; discard?: () => void };
type Registry = { version: number; entries: Map<string, Pending>; set: (key: string, value?: Pending) => void };
const fallback: Registry = { version: 0, entries: new Map(), set: () => {} };
const Context = createContext(fallback);
export function PendingFormsProvider({children}:{children:ReactNode}) {
  const entries=useRef(new Map<string,Pending>()); const [version,setVersion]=useState(0);
  const set=useMemo(()=> (key:string,value?:Pending)=>{if(value) entries.current.set(key,value);else entries.current.delete(key);setVersion(v=>v+1);},[]);
  return <Context.Provider value={{version,entries:entries.current,set}}>{children}</Context.Provider>;
}
export const usePendingForms=()=>useContext(Context);
export function usePendingChanges(key:string, dirty:boolean, save?:()=>void, discard?:()=>void) {
  const registry=usePendingForms(); const latest=useRef({save,discard});latest.current={save,discard};
  useEffect(()=>{registry.set(key,dirty?{save:save?()=>latest.current.save?.():undefined,discard:()=>latest.current.discard?.()}:undefined);return()=>registry.set(key);},[registry.set,key,dirty,!!save]);
  useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
}
function snapshot(form:HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>("input,select,textarea")).filter(e=>!(e instanceof HTMLInputElement && ["submit","button","hidden"].includes(e.type))).map((e,i)=>({element:e,key:e.name||String(i),value:e instanceof HTMLInputElement && ["checkbox","radio"].includes(e.type)?String(e.checked):e.value}));
}
export function TrackedForm({saved,identity,formRef,children,...props}:FormHTMLAttributes<HTMLFormElement>&{saved?:unknown;identity?:string;formRef?:RefObject<HTMLFormElement|null>}) {
  const localRef=useRef<HTMLFormElement>(null);const ref=formRef??localRef;const initial=useRef<string[]>([]);const touched=useRef(false);const [dirty,setDirty]=useState(false);
  const key=useRef(`form-${Math.random().toString(36).slice(2)}`).current;
  function reset(){if(!ref.current)return;initial.current=snapshot(ref.current).map(e=>e.value);touched.current=false;setDirty(false);}
  useLayoutEffect(reset,[identity]);
  useEffect(()=>{if(saved)reset();},[saved]);
  useLayoutEffect(()=>{if(!touched.current)reset();else if(ref.current)setDirty(snapshot(ref.current).some((e,i)=>e.value!==(initial.current[i]??"")));});
  function changed(){touched.current=true;if(ref.current)setDirty(snapshot(ref.current).some((e,i)=>e.value!==(initial.current[i]??"")));}
  useEffect(()=>{if(ref.current) snapshot(ref.current).forEach((e,i)=>e.element.classList.toggle("field-pending",dirty&&e.value!==(initial.current[i]??"")));},[dirty,children]);
  usePendingChanges(key,dirty,()=>{if(ref.current?.reportValidity())ref.current.requestSubmit();},reset);
  return <form {...props} ref={ref} data-dirty={dirty||undefined} onInputCapture={changed} onChangeCapture={changed}>
    {dirty&&<p className="pending-indicator" role="status">Alterações não salvas <button type="button" className="text-button" onClick={()=>{const e=ref.current?.querySelector<HTMLElement>(".field-pending");e?.scrollIntoView?.({block:"center"});e?.focus();}}>Localizar alterações</button></p>}{children}
  </form>;
}
