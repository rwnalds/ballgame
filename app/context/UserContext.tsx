"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface UserRole {
    id: number;
    name: string;
    label: string;
    description: string;
}

export interface UserData {
    id: number;
    guid: string;
    name: string;
    surname: string;
    email: string;
    started_to_work: string;
    roles: UserRole[];
    token: string;
}

interface UserContextType {
    user: UserData | null;
    setUser: (user: UserData | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserData | null>(null);
    return (
        <UserContext.Provider value={{ user, setUser }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}; 