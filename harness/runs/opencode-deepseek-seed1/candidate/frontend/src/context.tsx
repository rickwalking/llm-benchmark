import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Member } from './api';
import { api } from './api';

interface AppContextType {
  selectedMember: Member | null;
  setSelectedMember: (member: Member | null) => void;
  members: Member[];
  refreshMembers: () => void;
}

const AppContext = createContext<AppContextType>({
  selectedMember: null,
  setSelectedMember: () => {},
  members: [],
  refreshMembers: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedMember, setSelectedMemberState] = useState<Member | null>(() => {
    try {
      const stored = localStorage.getItem('selectedMember');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [members, setMembers] = useState<Member[]>([]);

  const setSelectedMember = useCallback((member: Member | null) => {
    setSelectedMemberState(member);
    if (member) {
      localStorage.setItem('selectedMember', JSON.stringify(member));
    } else {
      localStorage.removeItem('selectedMember');
    }
  }, []);

  const refreshMembers = useCallback(() => {
    api.members.list().then(setMembers).catch(console.error);
  }, []);

  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

  return (
    <AppContext.Provider value={{ selectedMember, setSelectedMember, members, refreshMembers }}>
      {children}
    </AppContext.Provider>
  );
}
