import {format,isToday,isTomorrow} from 'date-fns';import {ja} from 'date-fns/locale';
export const dateLabel=(value:string)=>format(new Date(value),'M月d日（E）',{locale:ja});
export const timeLabel=(value:string)=>format(new Date(value),'HH:mm');
export const dueLabel=(value?:string)=>!value?'期限なし':isToday(new Date(value))?'今日まで':isTomorrow(new Date(value))?'明日まで':`${format(new Date(value),'M月d日')}まで`;
