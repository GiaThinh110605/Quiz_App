import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);

    const login = async (credentials) => {
        const params = new URLSearchParams(credentials);
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        const data = await res.json();
        if (data.access_token) {
            localStorage.setItem('token', data.access_token);
            setUser({ username: credentials.username });
            return { success: true };
        }
        return { success: false, error: data.detail || 'Login failed' };
    };

    const register = async (userData) => {
        const params = new URLSearchParams(userData);
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        if (res.ok) return { success: true };
        const data = await res.json();
        return { success: false, error: data.detail || 'Registration failed' };
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);