import {X} from 'lucide-react';import type {ButtonHTMLAttributes,ReactNode} from 'react';
export function Button({className='',...p}:ButtonHTMLAttributes<HTMLButtonElement>){return <button className={`btn ${className}`} {...p}/>}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal"><header><h2>{title}</h2><button className="icon-btn" aria-label="閉じる" onClick={onClose}><X/></button></header>{children}</section></div>}
export function Empty({children}:{children:ReactNode}){return <div className="empty">{children}</div>}
export function Pill({children,tone='gray'}:{children:ReactNode;tone?:'gray'|'green'|'orange'|'red'}){return <span className={`pill ${tone}`}>{children}</span>}
