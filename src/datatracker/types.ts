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
  active: boolean;
  address: string;
  origin: string;
  person: string;
  primary: boolean;
  time: string;
}

export interface MeetingRegistration {
  affiliation: string;
  meeting: string;
  person: string;
  email: string;
  first_name: string;
  last_name: string;
}
