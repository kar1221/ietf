export interface TastypieResponse<T> {
  meta: {
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total_count: number;
  };
  objects: T[];
}

export interface PersonInfo {
  id: number;
  active: boolean;
  address: string;
  origin: string;
  person: string;
  primary: boolean;
  time: string;
}

export interface MeetingRegistration {
  id: number;
  affiliation: string;
  meeting: string;
  person: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface Meeting {
  id: number;
  date: string;
}

export interface DocHistory {
  id: number;
  affiliation: string;
  document: string;
  person: string;
}
