# 🌌 DBMS

[![Release](https://github.com/neondeveloperz/dbms/actions/workflows/release.yml/badge.svg)](https://github.com/neondeveloperz/dbms/actions/workflows/release.yml)

A modern, high-performance Database Management System built with **Tauri v2**, **Next.js 15**, and **Rust**. Effortlessly manage multiple database types with a minimalist and blazing-fast interface.

---

## ✨ Key Features

- **Multi-Database Support**: Connect to PostgreSQL, MySQL, MSSQL, MongoDB, and Redis.
- **Unified Query Editor**: A single workspace to run SQL, JSON commands (MongoDB), or Redis commands.
- **Live Table Explorer**: Instantly browse tables and collections within your active connection.
- **Connection Management**: Save, edit, and duplicate connections with custom labels and colors.
- **Modern UI/UX**: Built with Tailwind CSS 4, Lucide icons, and a dark-first aesthetic.
- **Built-in Security**: Local connection storage with configurable connection timeouts.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State Management**: React Hooks (useState, useEffect)

### Backend (Native)
- **Core**: [Tauri v2](https://v2.tauri.app/) (Rust)
- **Database Drivers**:
  - `sqlx`: PostgreSQL & MySQL
  - `tiberius`: Microsoft SQL Server (MSSQL)
  - `mongodb`: MongoDB
  - `redis`: Redis
- **Serialization**: `serde` & `serde_json`

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **Rust**: Latest stable version via [rustup](https://rustup.rs/)
- **System Dependencies**: See [Tauri Prerequisites](https://v2.tauri.app/guides/getting-started/prerequisites/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/neondeveloperz/dbms.git
   cd dbms
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

4. **Build for production**:
   ```bash
   npm run tauri build
   ```

---

## 🏗️ Project Structure

```text
├── app/                # Next.js Frontend (React components & UI)
├── public/             # Static assets
├── src-tauri/          # Rust Backend
│   ├── src/
│   │   ├── db.rs       # Database interaction logic & Client factory
│   │   ├── settings.rs # App configuration & Persistence
│   │   ├── main.rs     # Tauri entry point & command handlers
│   └── Cargo.toml      # Rust dependencies
├── package.json        # Node.js dependencies & Scripts
└── tsconfig.json       # TypeScript configuration
```
---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Built with ❤️ by Armzi**
