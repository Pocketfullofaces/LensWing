const CLASSES = ["ADONIS","AFRICAN GIANT SWALLOWTAIL","AMERICAN SNOOT","AN 88","APPOLLO","ARCIGERA FLOWER MOTH","ATALA","ATLAS MOTH","BANDED ORANGE HELICONIAN","BANDED PEACOCK","BANDED TIGER MOTH","BECKERS WHITE","BIRD CHERRY ERMINE MOTH","BLACK HAIRSTREAK","BLUE MORPHO","BLUE SPOTTED CROW","BROOKES BIRDWING","BROWN ARGUS","BROWN SIPROETA","CABBAGE WHITE","CAIRNS BIRDWING","CHALK HILL BLUE","CHECQUERED SKIPPER","CHESTNUT","CINNABAR MOTH","CLEARWING MOTH","CLEOPATRA","CLODIUS PARNASSIAN","CLOUDED SULPHUR","COMET MOTH","COMMON BANDED AWL","COMMON WOOD-NYMPH","COPPER TAIL","CRECENT","CRIMSON PATCH","DANAID EGGFLY","EASTERN COMA","EASTERN DAPPLE WHITE","EASTERN PINE ELFIN","ELBOWED PIERROT","EMPEROR GUM MOTH","GARDEN TIGER MOTH","GIANT LEOPARD MOTH","GLITTERING SAPPHIRE","GOLD BANDED","GREAT EGGFLY","GREAT JAY","GREEN CELLED CATTLEHEART","GREEN HAIRSTREAK","GREY HAIRSTREAK","HERCULES MOTH","HUMMING BIRD HAWK MOTH","INDRA SWALLOW","IO MOTH","Iphiclus sister","JULIA","LARGE MARBLE","LUNA MOTH","MADAGASCAN SUNSET MOTH","MALACHITE","MANGROVE SKIPPER","MESTRA","METALMARK","MILBERTS TORTOISESHELL","MONARCH","MOURNING CLOAK","OLEANDER HAWK MOTH","ORANGE OAKLEAF","ORANGE TIP","ORCHARD SWALLOW","PAINTED LADY","PAPER KITE","PEACOCK","PINE WHITE","PIPEVINE SWALLOW","POLYPHEMUS MOTH","POPINJAY","PURPLE HAIRSTREAK","PURPLISH COPPER","QUESTION MARK","RED ADMIRAL","RED CRACKER","RED POSTMAN","RED SPOTTED PURPLE","ROSY MAPLE MOTH","SCARCE SWALLOW","SILVER SPOT SKIPPER","SIXSPOT BURNET MOTH","SLEEPY ORANGE","SOOTYWING","SOUTHERN DOGFACE","STRAITED QUEEN","TROPICAL LEAFWING","TWO BARRED FLASHER","ULYSES","VICEROY","WHITE LINED SPHINX MOTH","WOOD SATYR","YELLOW SWALLOW TAIL","ZEBRA LONG WING"];

const IS_MOTH = CLASSES.map(n => /MOTH/i.test(n));
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD  = [0.229, 0.224, 0.225];

const $ = id => document.getElementById(id);
const statusEl = $("status"), btn = $("btn"), preview = $("preview");
let session = null, imgReady = false;

function setStatus(text, cls){ statusEl.textContent = text; statusEl.className = "status " + cls; }

// ---------- Muat model ----------
async function createSession(source){
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/";
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create(source, { executionProviders: ["wasm"] });
  setStatus("Model siap digunakan ✓", "ok");
  $("manual").hidden = true;
  refreshBtn();
}

async function loadModel(){
  try{
    const res = await fetch("model.onnx");
    if(!res.ok) throw new Error("HTTP " + res.status);
    await createSession(await res.arrayBuffer());
  }catch(e){
    console.warn(e);
    setStatus("Pilih file model.onnx secara manual", "err");
    $("manual").hidden = false;
  }
}

$("model-file").addEventListener("change", async e => {
  const f = e.target.files[0]; if(!f) return;
  setStatus("Memuat model…", "loading");
  try{ await createSession(await f.arrayBuffer()); }
  catch(err){ setStatus("Gagal memuat model: " + err.message, "err"); }
});

// ---------- Pilih gambar ----------
function refreshBtn(){ btn.disabled = !(session && imgReady); }

function showFile(file){
  if(!file || !file.type.startsWith("image/")) return;
  showUrl(URL.createObjectURL(file));
}

function showUrl(url){
  imgReady = false; refreshBtn();
  preview.onload = () => { imgReady = true; refreshBtn(); };
  preview.src = url;
  preview.hidden = false;
  $("dz-text").hidden = true;
  $("result").hidden = true;
}

$("file").addEventListener("change", e => showFile(e.target.files[0]));
$("file-cam").addEventListener("change", e => showFile(e.target.files[0]));
const dz = $("dropzone");
["dragenter","dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave","drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", e => showFile(e.dataTransfer.files[0]));

// ---------- Kamera ----------
let stream = null, facing = "environment";
const video = $("video"), camBox = $("camera");

async function startCamera(){
  stopCamera();
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
    video.srcObject = stream;
    camBox.hidden = false;
    $("cam-open").hidden = true;
  }catch(e){
    console.warn(e);
    alert("Kamera tidak bisa diakses. Pastikan izin kamera diberikan dan halaman dibuka lewat HTTPS atau localhost.");
    stopCamera();
  }
}

function stopCamera(){
  if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null;
  camBox.hidden = true;
  $("cam-open").hidden = false;
}

$("cam-open").addEventListener("click", () => {
  // Jika browser tidak mendukung getUserMedia (mis. bukan HTTPS), pakai kamera bawaan HP lewat input capture.
  if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext) startCamera();
  else $("file-cam").click();
});
$("cam-close").addEventListener("click", stopCamera);
$("cam-switch").addEventListener("click", () => { facing = facing === "environment" ? "user" : "environment"; startCamera(); });
$("cam-shot").addEventListener("click", () => {
  if(!video.videoWidth) return;
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  showUrl(c.toDataURL("image/jpeg", 0.92));
  stopCamera();
});

// ---------- Prapemrosesan: resize 224x224 + normalisasi ImageNet, format NCHW ----------
function toTensor(img){
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE, out = new Float32Array(3 * plane);
  for(let i = 0; i < plane; i++){
    for(let ch = 0; ch < 3; ch++){
      out[ch * plane + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    }
  }
  return new ort.Tensor("float32", out, [1, 3, SIZE, SIZE]);
}

function softmax(a){
  const m = Math.max(...a), e = a.map(v => Math.exp(v - m)), s = e.reduce((x, y) => x + y, 0);
  return e.map(v => v / s);
}

const pct = v => (v * 100).toFixed(1) + "%";
const nice = s => s.toLowerCase();

// ---------- Klasifikasi ----------
btn.addEventListener("click", async () => {
  btn.disabled = true; btn.textContent = "Memproses…";
  try{
    const out = await session.run({ input: toTensor(preview) });
    const probs = softmax(Array.from(out.logits.data));

    const order = probs.map((p, i) => i).sort((a, b) => probs[b] - probs[a]);
    const best = order[0];

    let pMoth = 0;
    probs.forEach((p, i) => { if(IS_MOTH[i]) pMoth += p; });
    const pButterfly = 1 - pMoth;

    // hasil utama
    const moth = IS_MOTH[best];
    const badge = $("badge");
    badge.textContent = moth ? "🌙 NGENGAT" : "🦋 KUPU-KUPU";
    badge.className = "badge " + (moth ? "moth" : "butterfly");
    $("species").textContent = nice(CLASSES[best]);
    $("conf").textContent = "Keyakinan " + pct(probs[best]);

    // bar kupu-kupu vs ngengat
    const bb = $("bar-butterfly"), bm = $("bar-moth");
    bb.style.width = (pButterfly * 100) + "%"; bb.textContent = pButterfly > .12 ? "Kupu-kupu " + pct(pButterfly) : "";
    bm.style.width = (pMoth * 100) + "%";      bm.textContent = pMoth > .12 ? "Ngengat " + pct(pMoth) : "";

    // top 5
    $("top5").innerHTML = order.slice(0, 5).map(i => `
      <li><span class="name">${nice(CLASSES[i])} ${IS_MOTH[i] ? "🌙" : "🦋"}</span><span class="pct">${pct(probs[i])}</span>
      <div class="track"><div class="fill" style="width:${probs[i] * 100}%"></div></div></li>`).join("");

    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }catch(e){
    console.error(e);
    setStatus("Gagal memproses: " + e.message, "err");
  }finally{
    btn.textContent = "Klasifikasi"; refreshBtn();
  }
});

loadModel();