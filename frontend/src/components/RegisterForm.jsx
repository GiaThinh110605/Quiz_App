import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function RegisterForm() {
    const [form, setForm] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await register(form);
        if (result.success) navigate('/login');
        else setError(typeof result.error === 'string' ? result.error : 'Registration failed');
    };

    return (
        <div className="auth-container">
            <h2>Đăng ký</h2>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleSubmit}>
                <input placeholder="Username" value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })} required />
                <input type="email" placeholder="Email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} required />
                <input type="password" placeholder="Password" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })} required />
                <button type="submit">Đăng ký</button>
            </form>
            <p>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
        </div>
    );
}