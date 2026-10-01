# DevBuddy

A full-stack AI dev assistant with a **FastAPI** backend (BE) and a **React + Vite** frontend (FE).

---

## Project Structure

```
DevBuddy/
├── BE/          # Python FastAPI backend
└── FE/          # React + Vite frontend
```

---

## Backend (BE)

### Requirements

- Python 3.12+

### Setup

```bash
cd BE

# Create virtual environment (already done — skip if venv/ exists)
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env and fill in any required values
```

### Run the development server

```bash
# Make sure the venv is activated
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

## Frontend (FE)

### Requirements

- Node.js 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

### Setup

```bash
cd FE

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
cd BE
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend**
```bash
cd FE
pnpm dev
```
# DevBuddy
