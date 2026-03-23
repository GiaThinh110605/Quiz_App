import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginForm() {
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await login(form);
        if (result.success) navigate('/quiz');
        else setError(typeof result.error === 'string' ? result.error : 'Login failed');
    };

    return (
        <div className="auth-container">
            <h2>Đăng nhập</h2>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleSubmit}>
                <input placeholder="Username" value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })} required />
                <br />
                <input type="password" placeholder="Password" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })} required />
                <br />
                <br />
                <button type="submit">Đăng nhập</button>
            </form>
            <p>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
        </div>
    );
}