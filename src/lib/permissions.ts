import type {Role} from '../types';
export const can=(role:Role,action:'manage_members'|'delete_any'|'edit_own'|'view')=>action==='view'||action==='edit_own'||role==='owner'||(role==='admin'&&action==='delete_any');
