from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date, timedelta
from enum import Enum
import httpx
from cryptography.fernet import Fernet
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configuration pour Render
PORT = int(os.getenv("PORT", 8001))

# Configuration MongoDB
mongo_url = os.environ.get('MONGO_URL', 'mongodb+srv://alicia2bbb:LW8g5ucU87qkRY2W@cluster0.tjxk7lx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
db_name = os.environ.get('DB_NAME', 'Cluster0')

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Configuration CORS pour Render
ALLOWED_ORIGINS = [
    "https://hennalash.fr",
    "https://www.hennalash.fr",
    "http://localhost:3000"
]

app = FastAPI(
    title="Henna Artist API",
    description="API pour le site web de l'artiste henné",
    version="1.0.0"
)

api_router = APIRouter(prefix="/api")

class ServiceType(str, Enum):
    SIMPLE = "simple"
    MOYEN = "moyen"
    CHARGE = "charge"
    MARIEE = "mariee"

class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    client_email: str
    client_phone: str
    client_instagram: Optional[str] = None
    service_type: ServiceType
    appointment_date: date
    appointment_time: str
    location_type: str
    address: Optional[str] = None
    additional_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "pending"  # pending, confirmed, cancelled

class AppointmentCreate(BaseModel):
    client_name: str
    client_email: str
    client_phone: str
    client_instagram: Optional[str] = None
    service_type: ServiceType
    appointment_date: date
    appointment_time: str
    location_type: str
    address: Optional[str] = None
    additional_notes: Optional[str] = None

class ContactMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ContactMessageCreate(BaseModel):
    name: str
    email: str
    message: str

class TimeSlot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: date
    time: str
    is_available: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TimeSlotCreate(BaseModel):
    date: date
    time: str
    is_available: bool = True

@api_router.get("/")
async def root():
    return {"message": "API du site de henné - Hennaa.lash"}

@api_router.get("/services")
async def get_services():
    services = {
        "simple": {"name": "Henné Simple", "price": 5, "duration": "30min"},
        "moyen": {"name": "Henné Moyen", "price": 8, "duration": "45min-1h", "note": "par main"},
        "charge": {"name": "Henné Chargé", "price": 12, "duration": "1h-1h30", "note": "par main"},
        "mariee": {"name": "Henné Mariée", "price": 20, "duration": "1h30-2h", "note": "par main"}
    }
    return services

@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(appointment_data: AppointmentCreate):
    try:
        appointment_dict = appointment_data.dict()
        appointment = Appointment(**appointment_dict)
        
        appointment_data_for_db = appointment.dict()
        appointment_data_for_db['appointment_date'] = appointment_data_for_db['appointment_date'].isoformat()
        appointment_data_for_db['created_at'] = appointment_data_for_db['created_at'].isoformat()
        
        result = await db.appointments.insert_one(appointment_data_for_db)
        
        if result.inserted_id:
            return appointment
        else:
            raise HTTPException(status_code=500, detail="Erreur lors de la création du rendez-vous")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.get("/appointments", response_model=List[Appointment])
async def get_appointments():
    try:
        appointments = await db.appointments.find().sort("appointment_date", 1).to_list(1000)
        for appointment in appointments:
            if isinstance(appointment['appointment_date'], str):
                appointment['appointment_date'] = datetime.fromisoformat(appointment['appointment_date']).date()
            if isinstance(appointment['created_at'], str):
                appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
        return [Appointment(**appointment) for appointment in appointments]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.get("/appointments/{appointment_id}", response_model=Appointment)
async def get_appointment(appointment_id: str):
    try:
        appointment = await db.appointments.find_one({"id": appointment_id})
        if not appointment:
            raise HTTPException(status_code=404, detail="Rendez-vous non trouvé")
        
        # Convert string dates back to date objects for response
        if isinstance(appointment['appointment_date'], str):
            appointment['appointment_date'] = datetime.fromisoformat(appointment['appointment_date']).date()
        if isinstance(appointment['created_at'], str):
            appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
            
        return Appointment(**appointment)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.put("/appointments/{appointment_id}/status")
async def update_appointment_status(appointment_id: str, status: str):
    try:
        # Validate status
        valid_statuses = ["pending", "confirmed", "cancelled"]
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail="Statut invalide")
        
        result = await db.appointments.update_one(
            {"id": appointment_id},
            {"$set": {"status": status}}
        )
        if result.matched_count:
            return {"message": "Statut mis à jour avec succès", "status": status}
        else:
            raise HTTPException(status_code=404, detail="Rendez-vous non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.post("/contact", response_model=ContactMessage)
async def create_contact_message(contact_data: ContactMessageCreate):
    try:
        contact_dict = contact_data.dict()
        contact_message = ContactMessage(**contact_dict)
        
        # Convert to dict with proper serialization for MongoDB
        contact_data_for_db = contact_message.dict()
        # Convert datetime to string for MongoDB storage
        contact_data_for_db['created_at'] = contact_data_for_db['created_at'].isoformat()
        
        result = await db.contact_messages.insert_one(contact_data_for_db)
        
        if result.inserted_id:
            return contact_message
        else:
            raise HTTPException(status_code=500, detail="Erreur lors de l'envoi du message")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.get("/contact", response_model=List[ContactMessage])
async def get_contact_messages():
    try:
        messages = await db.contact_messages.find().sort("created_at", -1).to_list(1000)
        # Convert string dates back to datetime objects for response
        for message in messages:
            if isinstance(message['created_at'], str):
                message['created_at'] = datetime.fromisoformat(message['created_at'])
        return [ContactMessage(**message) for message in messages]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Routes pour la gestion des créneaux horaires
@api_router.get("/available-slots", response_model=List[TimeSlot])
async def get_available_slots():
    try:
        slots = await db.time_slots.find().sort("date", 1).to_list(1000)
        # Convert string dates back to date objects for response
        for slot in slots:
            if isinstance(slot['date'], str):
                slot['date'] = datetime.fromisoformat(slot['date']).date()
            if isinstance(slot['created_at'], str):
                slot['created_at'] = datetime.fromisoformat(slot['created_at'])
        return [TimeSlot(**slot) for slot in slots]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.post("/available-slots", response_model=TimeSlot)
async def create_time_slot(slot_data: TimeSlotCreate):
    try:
        # Vérifier si le créneau existe déjà
        existing_slot = await db.time_slots.find_one({
            "date": slot_data.date.isoformat(),
            "time": slot_data.time
        })
        
        if existing_slot:
            raise HTTPException(status_code=400, detail="Ce créneau existe déjà")
        
        # Créer le créneau
        slot_dict = slot_data.dict()
        slot = TimeSlot(**slot_dict)
        
        # Préparer pour MongoDB
        slot_data_for_db = slot.dict()
        slot_data_for_db['date'] = slot_data_for_db['date'].isoformat()
        slot_data_for_db['created_at'] = slot_data_for_db['created_at'].isoformat()
        
        # Insérer dans la base
        result = await db.time_slots.insert_one(slot_data_for_db)
        
        if result.inserted_id:
            return slot
        else:
            raise HTTPException(status_code=500, detail="Erreur lors de la création du créneau")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.delete("/available-slots/{slot_id}")
async def delete_time_slot(slot_id: str):
    try:
        result = await db.time_slots.delete_one({"id": slot_id})
        if result.deleted_count:
            return {"message": "Créneau supprimé avec succès"}
        else:
            raise HTTPException(status_code=404, detail="Créneau non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.put("/available-slots/{slot_id}")
async def update_time_slot_availability(slot_id: str, is_available: bool):
    try:
        result = await db.time_slots.update_one(
            {"id": slot_id},
            {"$set": {"is_available": is_available}}
        )
        if result.matched_count:
            return {"message": "Disponibilité mise à jour avec succès", "is_available": is_available}
        else:
            raise HTTPException(status_code=404, detail="Créneau non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Instagram Models
class InstagramToken(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "henna_artist"
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
class InstagramAuthRequest(BaseModel):
    code: str
    
class InstagramPost(BaseModel):
    id: str
    media_url: str
    media_type: str
    caption: Optional[str] = None
    timestamp: str
    permalink: str

@api_router.post("/instagram/auth")
async def instagram_auth(auth_request: InstagramAuthRequest):
    try:
        app_id = os.getenv("INSTAGRAM_APP_ID")
        app_secret = os.getenv("INSTAGRAM_APP_SECRET") 
        redirect_uri = os.getenv("INSTAGRAM_REDIRECT_URI")
        
        if not all([app_id, app_secret, redirect_uri]):
            raise HTTPException(status_code=500, detail="Configuration Instagram manquante")
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.instagram.com/oauth/access_token",
                data={
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code": auth_request.code
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Échec de l'échange de token")
                
            token_data = response.json()
            
            # Créer le token avec expiration (60 jours)
            token = InstagramToken(
                access_token=token_data["access_token"],
                expires_at=datetime.utcnow() + timedelta(days=60)
            )
            
            # Stocker en base de données
            await db.instagram_tokens.update_one(
                {"user_id": "henna_artist"},
                {"$set": token.dict()},
                upsert=True
            )
            
            return {"status": "success", "message": "Token Instagram configuré avec succès"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'authentification: {str(e)}")

@api_router.get("/instagram/posts")
async def get_instagram_posts():
    try:
        token_doc = await db.instagram_tokens.find_one({"user_id": "henna_artist"})
        
        if not token_doc:
            raise HTTPException(status_code=404, detail="Token Instagram non trouvé. Veuillez vous authentifier d'abord.")
            
        if datetime.utcnow() > token_doc["expires_at"]:
            raise HTTPException(status_code=401, detail="Token Instagram expiré. Veuillez vous réauthentifier.")
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://graph.instagram.com/me/media",
                params={
                    "fields": "id,media_url,media_type,caption,timestamp,permalink",
                    "access_token": token_doc["access_token"],
                    "limit": 20
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Erreur lors de la récupération des posts")
                
            posts_data = response.json()
            
            posts = []
            for post in posts_data.get("data", []):
                if post.get("media_type") in ["IMAGE", "VIDEO"]:
                    posts.append(InstagramPost(**post))
                    
            return {"posts": posts}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.get("/instagram/auth-url")
async def get_instagram_auth_url():
    try:
        app_id = os.getenv("INSTAGRAM_APP_ID")
        redirect_uri = os.getenv("INSTAGRAM_REDIRECT_URI")
        
        if not app_id or not redirect_uri:
            raise HTTPException(status_code=500, detail="Configuration Instagram manquante")
            
        auth_url = f"https://api.instagram.com/oauth/authorize?client_id={app_id}&redirect_uri={redirect_uri}&scope=user_profile,user_media&response_type=code"
        
        return {"auth_url": auth_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.delete("/instagram/token")
async def revoke_instagram_token():
    try:
        result = await db.instagram_tokens.delete_one({"user_id": "henna_artist"})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Aucun token trouvé")
            
        return {"status": "success", "message": "Token Instagram révoqué"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()