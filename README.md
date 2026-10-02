# DevBuddy

A full-stack AI dev assistant with a **FastAPI** backend and a **React + Vite** frontend.

---

## Project Structure

```
DevBuddy/
├── BE-FastAPI/      # Python FastAPI backend
└── FE-React/        # React + Vite frontend
```

---

## Backend (BE-FastAPI)

### Requirements

- Python 3.12+
- PostgreSQL

### Setup

```bash
cd BE-FastAPI

# Create virtual environment (skip if venv/ exists)
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env and fill in your database credentials
```

### Run the development server

```bash
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

### Deactivate the virtual environment

```bash
deactivate
```

---

## Frontend (FE-React)

### Requirements

- Node.js 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

### Setup

```bash
cd FE-React

# Install dependencies
pnpm install
```

### Run the development server

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`.

### Build for production

```bash
pnpm build
```

---

## Running both servers

Open two terminals:

**Terminal 1 — Backend**
```bash
cd BE-FastAPI
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend**
```bash
cd FE-React
pnpm dev
```
