export const readStorage=<T>(key:string,fallback:T):T=>{try{const value=localStorage.getItem(key);return value?JSON.parse(value):fallback}catch{return fallback}};
export const writeStorage=(key:string,value:unknown)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{throw new Error('Úložisko prehliadača je plné. Odstráňte skúšobné fotografie alebo staré testovacie údaje.')}};
