const parse=<T>(s:string|null,f:T):T=>{try{return s?JSON.parse(s):f}catch{return f}};
export const storage={read<T>(key:string,fallback:T){return parse(localStorage.getItem(key),fallback)},write(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value))}catch{throw new Error('Lokálne úložisko je plné. Zálohujte údaje a odstráňte veľké testovacie fotografie.')}}};
