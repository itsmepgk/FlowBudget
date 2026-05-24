export interface AppUser {
  id: string
  email: string
  name: string
  nameChanged: boolean
}

export interface Group {
  id: number
  name: string
  invite_code: string
  owner_uuid: string
  currency: string
}

export interface GroupMember {
  user_uuid: string
  user_email: string
  name: string
}

export interface Expense {
  id: number
  group_id: number
  description: string
  amount: number
  paid_by: string
  category: string
  created_at: string
}

export interface GroupEvent {
  id: number
  group_id: number
  user_uuid: string
  event_type: string
  summary: string
  created_at: string
}

export interface SplitEntry {
  user_uuid: string
  amount: number
}

export type SplitType = 'equal' | 'custom' | 'ratio'
