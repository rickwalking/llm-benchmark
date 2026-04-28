import { createContext, useContext, useState, ReactNode } from 'react';
import type { Member } from '../types';

interface MemberContextType {
  selectedMember: Member | null;
  setSelectedMember: (member: Member | null) => void;
}

const MemberContext = createContext<MemberContextType | undefined>(undefined);

export function MemberProvider({ children }: { children: ReactNode }) {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  return (
    <MemberContext.Provider value={{ selectedMember, setSelectedMember }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useSelectedMember() {
  const context = useContext(MemberContext);
  if (!context) {
    throw new Error('useSelectedMember must be used within MemberProvider');
  }
  return context;
}
