export interface User {
  id: number;
  email: string;
  display_name: string;
  avatar_color: string;
  is_verified: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AdminColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  readonly: boolean;
}

export interface AdminTable {
  name: string;
  count: number;
  columns: AdminColumn[];
  supports_password: boolean;
}

export interface PublicUser {
  id: number;
  display_name: string;
  email: string;
  avatar_color: string;
}

export interface Friendship {
  friendship_id: number;
  dashboard_id: number;
  friend: PublicUser;
  created_at: string;
}

export interface FriendRequest {
  id: number;
  status: string;
  created_at: string;
  sender: PublicUser;
  receiver: PublicUser;
}

export interface Message {
  id: number;
  friendship_id: number;
  sender_id: number;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface StickyNote {
  id: number;
  dashboard_id: number;
  author_id: number;
  content: string;
  color: string;
  pos_x: number;
  pos_y: number;
  updated_at: string;
}

export interface ScheduleItem {
  id: number;
  dashboard_id: number;
  author_id: number;
  date: string;
  time: string;
  client: string;
  task: string;
  status: "planned" | "in_progress" | "done";
}

export interface ScheduleGroup {
  key: string;
  items: ScheduleItem[];
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface WsEvent {
  event: string;
  data: any;
}
