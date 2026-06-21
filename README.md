# 📸 Bo & Bentes kobberbryllup — foto-app v2

## Installation på Ubuntu-serveren

### 1. Installer Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Kopiér filerne til serveren
```bash
scp -r kobberbryllup/ bruger@SERVER-IP:~/kobberbryllup
```

### 3. Opret .env og udfyld dine egne værdier
```bash
cp .env.example .env
nano .env
```
Udfyld `PASSWORD`, `SSL_CERT`/`SSL_KEY` (sti til dine Let's Encrypt-certifikater) og evt. `EVENT_NAME` og `PUBLIC_URL`.

### 4. Installer afhængigheder og start
```bash
npm install
npm start
```

### 5. Font til polaroid (vigtigt!)
Download Satisfy-fonten og placer den i mappen:
```bash
# Download direkte på serveren:
wget -O Satisfy.ttf "https://fonts.gstatic.com/s/satisfy/v21/rP2Hp2yn6lkG50LoOZSCHBeHFl0.ttf"
```
Uden fonten bruges Georgia som fallback — stadig pænt men ikke helt det samme.

### 6. HTTPS med Let's Encrypt (anbefalet)
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d dit-domæne.dk
```
Peg `SSL_CERT` og `SSL_KEY` i `.env` på certifikat-stierne.

### 7. Find serverens IP
```bash
ip a | grep "inet " | grep -v 127.0.0.1
```

---

## Kodeord
Sættes i `.env` (se `.env.example`). **Commit aldrig `.env` til Git.**

---

## Arkitektur
- Gæster uploader råbilleder via HTTPS
- Serveren renderer polaroid-ramme med Sharp (hurtig)
- Færdige billeder gemmes i `uploads/`
- Session tokens — kodeord bruges kun ved login
- Rate limiting på login (10 forsøg / 15 min per IP)

---

## Autostart
```bash
sudo npm install -g pm2
pm2 start server.js --name kobberbryllup
pm2 startup && pm2 save
```

---

## Efter festen
Alle billeder ligger i `uploads/` — kopier mappen til Bo & Bentes computer:
```bash
scp -r bruger@SERVER-IP:~/kobberbryllup/uploads/ ./kobberbryllup-billeder/
```
