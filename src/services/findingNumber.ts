const pad=(value:number)=>String(value).padStart(4,'0');
export const formatFindingNumber=(sequence:number,date=new Date())=>`TK-${String(date.getFullYear()).slice(-2)}-${pad(sequence)}`;
