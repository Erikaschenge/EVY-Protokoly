import{Link}from'react-router-dom';import{Shell}from'./Shell';
export const Loading=({text='Načítavam…'}:{text?:string})=><Shell title="Načítavam"><div className="notice">{text}</div></Shell>;
export const Missing=({title='Záznam sa nenašiel'}:{title?:string})=><Shell title={title}><div className="notice"><Link to="/">Späť na úvod</Link></div></Shell>;
