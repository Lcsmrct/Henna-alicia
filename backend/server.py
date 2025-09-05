from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, date, timedelta
from enum import Enum
import httpx
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import asyncio

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

# Nouveaux modèles pour les avis clients
class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    service_type: str
    rating: int = Field(ge=1, le=5)  # Note de 1 à 5
    comment: str
    is_published: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ReviewCreate(BaseModel):
    client_name: str
    service_type: str
    rating: int = Field(ge=1, le=5)
    comment: str

class ReviewUpdate(BaseModel):
    is_published: bool

# Modèles pour l'espace client
class ClientLogin(BaseModel):
    email: str
    phone: str

class ClientSession(BaseModel):
    client_email: str
    client_phone: str
    authenticated_at: datetime = Field(default_factory=datetime.utcnow)

# Fonction pour envoyer des emails
async def send_email(to_email: str, subject: str, body: str, is_html: bool = True):
    try:
        smtp_server = os.getenv("SMTP_SERVER")
        smtp_port = int(os.getenv("SMTP_PORT", 587))
        smtp_email = os.getenv("SMTP_EMAIL")
        smtp_password = os.getenv("SMTP_PASSWORD")
        
        if not all([smtp_server, smtp_email, smtp_password]):
            logging.warning("Configuration email incomplète - email non envoyé")
            return False
            
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_email
        msg['To'] = to_email
        
        if is_html:
            msg.attach(MIMEText(body, 'html'))
        else:
            msg.attach(MIMEText(body, 'plain'))
        
        # Utiliser asyncio pour éviter de bloquer
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_email_sync, smtp_server, smtp_port, smtp_email, smtp_password, msg)
        
        logging.info(f"Email envoyé avec succès à {to_email}")
        return True
        
    except Exception as e:
        logging.error(f"Erreur lors de l'envoi de l'email: {str(e)}")
        return False

def _send_email_sync(smtp_server, smtp_port, smtp_email, smtp_password, msg):
    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(smtp_email, smtp_password)
        server.send_message(msg)

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
            # Envoyer email de confirmation au client
            await send_appointment_confirmation_email(appointment)
            
            # Envoyer notification à l'admin
            await send_admin_notification_email(appointment)
            
            return appointment
        else:
            raise HTTPException(status_code=500, detail="Erreur lors de la création du rendez-vous")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

async def send_appointment_confirmation_email(appointment: Appointment):
    """Envoie un email de confirmation au client"""
    services_info = {
        "simple": "Henné Simple (5€)",
        "moyen": "Henné Moyen (8€ par main)",
        "charge": "Henné Chargé (12€ par main)",
        "mariee": "Henné Mariée (20€ par main)"
    }
    
    service_name = services_info.get(appointment.service_type, appointment.service_type)
    appointment_date_str = appointment.appointment_date.strftime("%d/%m/%Y")
    
    subject = "✨ Confirmation de votre rendez-vous henné - Hennaa.lash"
    
    body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; text-align: center;">✨ Confirmation de rendez-vous</h2>
            <p>Bonjour {appointment.client_name},</p>
            <p>Votre rendez-vous a été enregistré avec succès ! Voici les détails :</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #2c3e50;">📅 Détails du rendez-vous</h3>
                <p><strong>Service :</strong> {service_name}</p>
                <p><strong>Date :</strong> {appointment_date_str}</p>
                <p><strong>Heure :</strong> {appointment.appointment_time}</p>
                <p><strong>Lieu :</strong> {"À domicile" if appointment.location_type == "domicile" else "En atelier"}</p>
                {f"<p><strong>Adresse :</strong> {appointment.address}</p>" if appointment.address else ""}
                {f"<p><strong>Notes :</strong> {appointment.additional_notes}</p>" if appointment.additional_notes else ""}
            </div>
            
            <p><strong>Statut :</strong> En attente de confirmation</p>
            <p>Je vous contacterai prochainement pour confirmer ce rendez-vous.</p>
            
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #27ae60;">📞 Besoin de me contacter ?</h4>
                <p>Instagram : <a href="https://instagram.com/hennaa.lash" style="color: #e1306c;">@hennaa.lash</a></p>
            </div>
            
            <p>Merci de votre confiance !</p>
            <p style="font-weight: bold;">Hennaa.lash ✨<br>
            <small>Artiste Henné - Secteur 27/28</small></p>
        </div>
    </body>
    </html>
    """
    
    await send_email(appointment.client_email, subject, body, True)

async def send_admin_notification_email(appointment: Appointment):
    """Envoie une notification à l'admin"""
    admin_email = os.getenv("ADMIN_EMAIL")
    if not admin_email:
        return
        
    services_info = {
        "simple": "Henné Simple (5€)",
        "moyen": "Henné Moyen (8€ par main)",
        "charge": "Henné Chargé (12€ par main)",
        "mariee": "Henné Mariée (20€ par main)"
    }
    
    service_name = services_info.get(appointment.service_type, appointment.service_type)
    appointment_date_str = appointment.appointment_date.strftime("%d/%m/%Y")
    
    subject = f"🔔 Nouveau rendez-vous - {appointment.client_name}"
    
    body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; text-align: center;">🔔 Nouveau rendez-vous</h2>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #2c3e50;">👤 Informations client</h3>
                <p><strong>Nom :</strong> {appointment.client_name}</p>
                <p><strong>Email :</strong> {appointment.client_email}</p>
                <p><strong>Téléphone :</strong> {appointment.client_phone}</p>
                {f"<p><strong>Instagram :</strong> @{appointment.client_instagram}</p>" if appointment.client_instagram else ""}
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #856404;">📅 Détails du rendez-vous</h3>
                <p><strong>Service :</strong> {service_name}</p>
                <p><strong>Date :</strong> {appointment_date_str}</p>
                <p><strong>Heure :</strong> {appointment.appointment_time}</p>
                <p><strong>Lieu :</strong> {"À domicile" if appointment.location_type == "domicile" else "En atelier"}</p>
                {f"<p><strong>Adresse :</strong> {appointment.address}</p>" if appointment.address else ""}
                {f"<p><strong>Notes :</strong> {appointment.additional_notes}</p>" if appointment.additional_notes else ""}
            </div>
            
            <p style="text-align: center;">
                <strong>⚠️ N'oubliez pas de confirmer ce rendez-vous via votre interface admin !</strong>
            </p>
        </div>
    </body>
    </html>
    """
    
    await send_email(admin_email, subject, body, True)

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
            # Envoyer email de mise à jour du statut au client
            appointment = await db.appointments.find_one({"id": appointment_id})
            if appointment and status in ["confirmed", "cancelled"]:
                await send_status_update_email(appointment, status)
            
            return {"message": "Statut mis à jour avec succès", "status": status}
        else:
            raise HTTPException(status_code=404, detail="Rendez-vous non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

async def send_status_update_email(appointment_data: dict, new_status: str):
    """Envoie un email de mise à jour du statut au client"""
    appointment_date_str = appointment_data['appointment_date']
    if isinstance(appointment_date_str, str):
        appointment_date_str = datetime.fromisoformat(appointment_date_str).strftime("%d/%m/%Y")
    
    if new_status == "confirmed":
        subject = "✅ Votre rendez-vous henné est confirmé !"
        status_message = "confirmé"
        status_color = "#27ae60"
        additional_info = """
        <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #27ae60;">✅ Rendez-vous confirmé</h4>
            <p>Votre rendez-vous est confirmé ! Je vous attends avec plaisir.</p>
            <p><strong>Rappel :</strong> Prévoyez environ 30 minutes avant le rendez-vous pour que le henné sèche correctement.</p>
        </div>
        """
    else:  # cancelled
        subject = "❌ Annulation de votre rendez-vous henné"
        status_message = "annulé"
        status_color = "#e74c3c"
        additional_info = """
        <div style="background: #fdeaea; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #e74c3c;">❌ Rendez-vous annulé</h4>
            <p>Votre rendez-vous a été annulé. N'hésitez pas à reprendre contact pour reprogrammer.</p>
        </div>
        """
    
    body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: {status_color}; text-align: center;">Mise à jour de votre rendez-vous</h2>
            <p>Bonjour {appointment_data['client_name']},</p>
            <p>Votre rendez-vous du <strong>{appointment_date_str} à {appointment_data['appointment_time']}</strong> a été <strong style="color: {status_color};">{status_message}</strong>.</p>
            
            {additional_info}
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #2c3e50;">📞 Questions ?</h4>
                <p>Instagram : <a href="https://instagram.com/hennaa.lash" style="color: #e1306c;">@hennaa.lash</a></p>
            </div>
            
            <p>Merci !</p>
            <p style="font-weight: bold;">Hennaa.lash ✨<br>
            <small>Artiste Henné - Secteur 27/28</small></p>
        </div>
    </body>
    </html>
    """
    
    await send_email(appointment_data['client_email'], subject, body, True)

# Routes pour les avis clients
@api_router.get("/reviews", response_model=List[Review])
async def get_reviews(published_only: bool = True):
    try:
        filter_criteria = {"is_published": True} if published_only else {}
        reviews = await db.reviews.find(filter_criteria).sort("created_at", -1).to_list(1000)
        
        for review in reviews:
            if isinstance(review['created_at'], str):
                review['created_at'] = datetime.fromisoformat(review['created_at'])
        
        return [Review(**review) for review in reviews]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.post("/reviews", response_model=Review)
async def create_review(review_data: ReviewCreate):
    try:
        review_dict = review_data.dict()
        review = Review(**review_dict)
        
        review_data_for_db = review.dict()
        review_data_for_db['created_at'] = review_data_for_db['created_at'].isoformat()
        
        result = await db.reviews.insert_one(review_data_for_db)
        
        if result.inserted_id:
            return review
        else:
            raise HTTPException(status_code=500, detail="Erreur lors de la création de l'avis")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.put("/reviews/{review_id}")
async def update_review_status(review_id: str, review_update: ReviewUpdate):
    try:
        result = await db.reviews.update_one(
            {"id": review_id},
            {"$set": {"is_published": review_update.is_published}}
        )
        if result.matched_count:
            return {"message": "Avis mis à jour avec succès"}
        else:
            raise HTTPException(status_code=404, detail="Avis non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.delete("/reviews/{review_id}")
async def delete_review(review_id: str):
    try:
        result = await db.reviews.delete_one({"id": review_id})
        if result.deleted_count:
            return {"message": "Avis supprimé avec succès"}
        else:
            raise HTTPException(status_code=404, detail="Avis non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Routes pour l'espace client
@api_router.post("/client/login")
async def client_login(login_data: ClientLogin):
    try:
        # Vérifier si le client a des rendez-vous avec cet email et téléphone
        appointments = await db.appointments.find({
            "client_email": login_data.email,
            "client_phone": login_data.phone
        }).to_list(100)
        
        if not appointments:
            raise HTTPException(status_code=404, detail="Aucun rendez-vous trouvé avec ces informations")
        
        # Créer une session simple (optionnel - peut être géré côté frontend)
        session = ClientSession(
            client_email=login_data.email,
            client_phone=login_data.phone
        )
        
        return {
            "message": "Connexion réussie",
            "client_name": appointments[0].get('client_name', ''),
            "total_appointments": len(appointments)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@api_router.get("/client/appointments")
async def get_client_appointments(email: str, phone: str):
    try:
        appointments = await db.appointments.find({
            "client_email": email,
            "client_phone": phone
        }).sort("appointment_date", -1).to_list(100)
        
        for appointment in appointments:
            if isinstance(appointment['appointment_date'], str):
                appointment['appointment_date'] = datetime.fromisoformat(appointment['appointment_date']).date()
            if isinstance(appointment['created_at'], str):
                appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
                
        return [Appointment(**appointment) for appointment in appointments]
        
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

# Instagram Models et routes (conservation de l'existant)
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