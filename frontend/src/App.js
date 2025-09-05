import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const App = () => {
  const [currentSection, setCurrentSection] = useState('home');
  const [services, setServices] = useState({});
  const [appointments, setAppointments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [updatingAppointment, setUpdatingAppointment] = useState(null);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState(null);
  const [instagramPosts, setInstagramPosts] = useState([]);
  const [loadingInstagram, setLoadingInstagram] = useState(false);
  const [instagramError, setInstagramError] = useState(null);
  
  // États pour l'espace client
  const [isClientLoggedIn, setIsClientLoggedIn] = useState(false);
  const [clientInfo, setClientInfo] = useState(null);
  const [clientAppointments, setClientAppointments] = useState([]);
  const [clientLogin, setClientLogin] = useState({ email: '', phone: '' });
  
  const [availableSlots, setAvailableSlots] = useState([]);
  const [newSlot, setNewSlot] = useState({
    date: '',
    time: '',
    is_available: true
  });
  
  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_instagram: '',
    service_type: 'simple',
    appointment_date: '',
    appointment_time: '',
    location_type: 'domicile',
    address: '',
    additional_notes: ''
  });

  // Nouveau state pour les avis
  const [newReview, setNewReview] = useState({
    client_name: '',
    service_type: 'simple',
    rating: 5,
    comment: ''
  });

  const fetchAvailableSlots = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/available-slots`);
      setAvailableSlots(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des créneaux:', error);
    }
  }, []);

  // Fonction pour récupérer les avis publiés
  const fetchReviews = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/reviews?published_only=true`);
      setReviews(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des avis:', error);
    }
  }, []);

  // Fonction pour récupérer tous les avis (admin)
  const fetchAllReviews = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/reviews?published_only=false`);
      setReviews(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des avis:', error);
    }
  }, []);

  // Fonction pour récupérer les posts Instagram
  const fetchInstagramPosts = useCallback(async () => {
    try {
      setLoadingInstagram(true);
      setInstagramError(null);
      
      const response = await axios.get(`${API}/instagram/posts`);
      setInstagramPosts(response.data.posts || []);
    } catch (error) {
      console.error('Erreur lors du chargement des posts Instagram:', error);
      
      if (error.response?.status === 404) {
        setInstagramError('Authentification Instagram requise. Contactez l\'administrateur.');
      } else if (error.response?.status === 401) {
        setInstagramError('Token Instagram expiré. Réauthentification nécessaire.');
      } else {
        setInstagramError('Impossible de charger les posts Instagram pour le moment.');
      }
    } finally {
      setLoadingInstagram(false);
    }
  }, []);

  const addTimeSlot = async (e) => {
    e.preventDefault();
    
    if (!newSlot.date || !newSlot.time) {
      alert('Veuillez remplir tous les champs');
      return;
    }
    
    const selectedDate = new Date(newSlot.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      alert('Impossible de créer un créneau dans le passé');
      return;
    }
    
    try {
      const response = await axios.post(`${API}/available-slots`, newSlot);
      
      setNewSlot({ date: '', time: '', is_available: true });
      
      await fetchAvailableSlots();
      
      alert('Créneau ajouté avec succès!');
      
    } catch (error) {
      console.error('Erreur lors de l\'ajout du créneau:', error);
      
      let errorMessage = 'Erreur inconnue';
      
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.status === 400) {
        errorMessage = 'Ce créneau existe déjà';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Erreur serveur - Veuillez réessayer';
      }
      
      alert(`Erreur: ${errorMessage}`);
    }
  };

  const deleteTimeSlot = async (slotId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce créneau ?')) {
      return;
    }
    
    try {
      const response = await axios.delete(`${API}/available-slots/${slotId}`);
      
      setAvailableSlots(prev => prev.filter(slot => slot.id !== slotId));
      
      alert('Créneau supprimé avec succès!');
      
    } catch (error) {
      console.error('Erreur lors de la suppression du créneau:', error);
      
      await fetchAvailableSlots();
      
      let errorMessage = 'Erreur de suppression';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.status === 404) {
        errorMessage = 'Créneau introuvable';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Erreur serveur';
      }
      
      alert(`Erreur: ${errorMessage}`);
    }
  };

  // Fonction pour la connexion client
  const handleClientLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/client/login`, clientLogin);
      setIsClientLoggedIn(true);
      setClientInfo(response.data);
      setCurrentSection('client-space');
      
      // Récupérer les rendez-vous du client
      const appointmentsResponse = await axios.get(`${API}/client/appointments?email=${clientLogin.email}&phone=${clientLogin.phone}`);
      setClientAppointments(appointmentsResponse.data);
      
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      alert(error.response?.data?.detail || 'Aucun rendez-vous trouvé avec ces informations');
    }
  };

  // Fonction pour créer un avis
  const handleCreateReview = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/reviews`, newReview);
      setNewReview({
        client_name: '',
        service_type: 'simple',
        rating: 5,
        comment: ''
      });
      alert('Merci pour votre avis ! Il sera publié après validation.');
    } catch (error) {
      console.error('Erreur lors de la création de l\'avis:', error);
      alert('Erreur lors de l\'envoi de votre avis. Veuillez réessayer.');
    }
  };

  // Fonction pour publier/dépublier un avis (admin)
  const toggleReviewPublication = async (reviewId, isPublished) => {
    try {
      await axios.put(`${API}/reviews/${reviewId}`, { is_published: !isPublished });
      await fetchAllReviews();
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'avis:', error);
      alert('Erreur lors de la mise à jour de l\'avis');
    }
  };

  // Fonction pour supprimer un avis (admin)
  const deleteReview = async (reviewId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet avis ?')) {
      return;
    }
    
    try {
      await axios.delete(`${API}/reviews/${reviewId}`);
      await fetchAllReviews();
      alert('Avis supprimé avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression de l\'avis');
    }
  };

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoadingServices(true);
        setServicesError(null);
        
        // Timeout pour gérer les cold starts (30 secondes)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 30000)
        );
        
        const fetchPromise = axios.get(`${API}/services`);
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        setServices(response.data);
      } catch (error) {
        console.error('Erreur lors du chargement des services:', error);
        setServicesError('Le serveur met un peu de temps à se réveiller... Cela peut prendre jusqu\'à 30 secondes.');
        
        // Retry après 3 secondes
        setTimeout(() => {
          fetchServices();
        }, 3000);
      } finally {
        setLoadingServices(false);
      }
    };
    fetchServices();
  }, []);

  useEffect(() => {
    fetchAvailableSlots();
    fetchReviews();
  }, [fetchAvailableSlots, fetchReviews]);

  // Fetch appointments for admin with optimization
  const fetchAppointments = useCallback(async () => {
    if (loadingAppointments) return; // Prevent multiple calls
    
    try {
      setLoadingAppointments(true);
      const response = await axios.get(`${API}/appointments`);
      setAppointments(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des rendez-vous:', error);
      alert('Erreur lors du chargement des rendez-vous');
    } finally {
      setLoadingAppointments(false);
    }
  }, [loadingAppointments]);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === 'ALIkhalid301124') {
      setIsAdmin(true);
      setCurrentSection('admin');
      fetchAppointments();
      fetchAvailableSlots();
      fetchAllReviews();
    } else {
      alert('Mot de passe incorrect');
    }
  };

  const handleInputChange = useCallback((e) => {
    e.persist();
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  }, []);

  const handleNewSlotChange = useCallback((e) => {
    e.persist();
    const { name, value } = e.target;
    setNewSlot(prevData => ({
      ...prevData,
      [name]: value
    }));
  }, []);

  const handleAdminPasswordChange = useCallback((e) => {
    e.persist();
    setAdminPassword(e.target.value);
  }, []);

  const handleClientLoginChange = useCallback((e) => {
    e.persist();
    const { name, value } = e.target;
    setClientLogin(prevData => ({
      ...prevData,
      [name]: value
    }));
  }, []);

  const handleReviewChange = useCallback((e) => {
    e.persist();
    const { name, value } = e.target;
    setNewReview(prevData => ({
      ...prevData,
      [name]: value
    }));
  }, []);

  const handleSubmitAppointment = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/appointments`, formData);
      
      if (formData.appointment_date && formData.appointment_time) {
        try {
          const selectedSlot = availableSlots.find(slot => 
            slot.date === formData.appointment_date && 
            slot.time === formData.appointment_time
          );
          
          if (selectedSlot) {
            await axios.put(`${API}/available-slots/${selectedSlot.id}?is_available=false`);
          }
        } catch (slotError) {
          console.error('Erreur lors de la mise à jour du créneau:', slotError);
        }
      }
      
      alert('Rendez-vous créé avec succès ! Vous recevrez un email de confirmation et Hennaa.lash vous contactera rapidement.');
      setFormData({
        client_name: '',
        client_email: '',
        client_phone: '',
        client_instagram: '',
        service_type: 'simple',
        appointment_date: '',
        appointment_time: '',
        location_type: 'domicile',
        address: '',
        additional_notes: ''
      });
      
      // Recharger les créneaux pour refléter les changements
      fetchAvailableSlots();
      
    } catch (error) {
      console.error('Erreur lors de la création du rendez-vous:', error);
      alert('Une erreur est survenue. Veuillez réessayer ou nous contacter via Instagram @hennaa.lash');
    }
  };

  // Update appointment status with optimized API call
  const updateAppointmentStatus = async (appointmentId, newStatus) => {
    if (updatingAppointment === appointmentId) return; // Prevent double clicks
    
    try {
      setUpdatingAppointment(appointmentId);
      
      // Optimistic update - update UI immediately
      setAppointments(prev => 
        prev.map(appointment => 
          appointment.id === appointmentId 
            ? { ...appointment, status: newStatus }
            : appointment
        )
      );

      // Make API call
      const response = await axios.put(`${API}/appointments/${appointmentId}/status`, null, {
        params: { status: newStatus }
      });

      if (response.data.message) {
        // Success message
        const statusText = newStatus === 'confirmed' ? 'confirmé' : 'annulé';
        alert(`Rendez-vous ${statusText} avec succès! Le client recevra un email de notification.`);
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      alert('Erreur lors de la mise à jour du statut');
      
      // Revert optimistic update on error
      await fetchAppointments();
    } finally {
      setUpdatingAppointment(null);
    }
  };

  // Navigation component
  const Navigation = () => (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-brand">
          <h1>
            <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7V10C2 16 6 21 12 22C18 21 22 16 22 10V7L12 2Z"/>
            </svg>
            Hennaa.lash
          </h1>
          <p>Artiste Henné • Secteur 27/28</p>
        </div>
        <div className="nav-links">
          <button 
            className={currentSection === 'home' ? 'nav-link active' : 'nav-link'} 
            onClick={() => setCurrentSection('home')}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9L12 2L21 9V20C21 20.5 20.5 21 20 21H4C3.5 21 3 20.5 3 20V9Z"/>
            </svg>
            Accueil
          </button>
          <button 
            className={currentSection === 'gallery' ? 'nav-link active' : 'nav-link'} 
            onClick={() => setCurrentSection('gallery')}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15L16 10L5 21"/>
            </svg>
            Galerie
          </button>
          <button 
            className={currentSection === 'services' ? 'nav-link active' : 'nav-link'} 
            onClick={() => setCurrentSection('services')}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7V10C2 16 6 21 12 22C18 21 22 16 22 10V7L12 2Z"/>
              <path d="M12 8V16"/>
              <path d="M8 12H16"/>
            </svg>
            Tarifs
          </button>
          <button 
            className={currentSection === 'appointment' ? 'nav-link active' : 'nav-link'} 
            onClick={() => setCurrentSection('appointment')}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <path d="M16 2V6"/>
              <path d="M8 2V6"/>
              <path d="M3 10H21"/>
            </svg>
            Réserver
          </button>
          <button 
            className={currentSection === 'reviews' ? 'nav-link active' : 'nav-link'} 
            onClick={() => setCurrentSection('reviews')}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Avis
          </button>
          <button 
            className={currentSection === 'contact' ? 'nav-link active' : 'nav-link'} 
            onClick={() => setCurrentSection('contact')}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Contact
          </button>
          {!isClientLoggedIn && (
            <button 
              className={currentSection === 'client-login' ? 'nav-link active client-link' : 'nav-link client-link'} 
              onClick={() => setCurrentSection('client-login')}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21V19C20 17.9 19.1 17 18 17H6C4.9 17 4 17.9 4 19V21"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Mon Espace
            </button>
          )}
          {isClientLoggedIn && (
            <button 
              className={currentSection === 'client-space' ? 'nav-link active client-link' : 'nav-link client-link'} 
              onClick={() => setCurrentSection('client-space')}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21V19C20 17.9 19.1 17 18 17H6C4.9 17 4 17.9 4 19V21"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Mes RDV
            </button>
          )}
          {!isAdmin && (
            <button 
              className={currentSection === 'admin-login' ? 'nav-link active admin-link' : 'nav-link admin-link'} 
              onClick={() => setCurrentSection('admin-login')}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <circle cx="12" cy="16" r="1"/>
                <path d="M7 11V7C7 5.67 7.67 4 12 4S17 5.67 17 7V11"/>
              </svg>
              Admin
            </button>
          )}
          {isAdmin && (
            <button 
              className={currentSection === 'admin' ? 'nav-link active admin-link' : 'nav-link admin-link'} 
              onClick={() => setCurrentSection('admin')}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <path d="M16 2V6"/>
                <path d="M8 2V6"/>
                <path d="M3 10H21"/>
              </svg>
              Dashboard
            </button>
          )}
        </div>
      </div>
    </nav>
  );

  // Home section - Amélioration design
  const HomeSection = () => (
    <div className="container">
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            ✨ Artiste Henné Professionnelle
          </div>
          <h1>L'Art du Henné<br />Traditionnel & Moderne</h1>
          <p className="hero-subtitle">
            Créations uniques et personnalisées dans le secteur 27/28.<br />
            Henné 100% naturel pour des motifs exceptionnels.
          </p>
          <div className="hero-actions">
            <button 
              onClick={() => setCurrentSection('appointment')}
              className="btn btn-primary btn-lg hero-btn"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <path d="M16 2V6"/>
                <path d="M8 2V6"/>
                <path d="M3 10H21"/>
              </svg>
              Réserver une séance
            </button>
            <button 
              onClick={() => setCurrentSection('gallery')}
              className="btn btn-outline btn-lg hero-btn"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15L16 10L5 21"/>
              </svg>
              Découvrir mes créations
            </button>
          </div>
          
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">100+</span>
              <span className="stat-label">Clients satisfaites</span>
            </div>
            <div className="stat">
              <span className="stat-number">3 ans</span>
              <span className="stat-label">D'expérience</span>
            </div>
            <div className="stat">
              <span className="stat-number">100%</span>
              <span className="stat-label">Henné naturel</span>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="section-header">
          <h2>Pourquoi choisir Hennaa.lash</h2>
          <p>Excellence et professionnalisme dans l'art du henné</p>
        </div>
        <div className="feature-grid">
          <div className="feature-item modern-card">
            <div className="feature-icon gradient-icon">
              <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7V10C2 16 6 21 12 22C18 21 22 16 22 10V7L12 2Z"/>
              </svg>
            </div>
            <h3>100% Naturel</h3>
            <p>Henné de qualité premium, sans produits chimiques, pour une couleur riche et durable qui respecte votre peau</p>
          </div>
          <div className="feature-item modern-card">
            <div className="feature-icon gradient-icon">
              <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
              </svg>
            </div>
            <h3>Créations Uniques</h3>
            <p>Chaque motif est personnalisé selon vos goûts et l'occasion. Travail minutieux pour un résultat exceptionnel</p>
          </div>
          <div className="feature-item modern-card">
            <div className="feature-icon gradient-icon">
              <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10C21 17 12 23 12 23S3 17 3 10C3 6 7 3 12 3S21 6 21 10Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <h3>Service à Domicile</h3>
            <p>Je me déplace dans le secteur 27/28 pour votre confort. Séance relaxante dans votre environnement</p>
          </div>
        </div>
      </section>
    </div>
  );

  // Gallery section - Améliorée
  const GallerySection = () => {
    const galleryImages = [
      {
        id: 1,
        image: "https://i.ibb.co/CpjCdZ8B/Capture-d-cran-2025-08-31-143559.png",
        caption: "Motifs traditionnels"
      },
      {
        id: 2,
        image: "https://i.ibb.co/q3WdDscn/IMG-6647.jpg",
        caption: "Henné mariée"
      },
      {
        id: 3,
        image: "https://i.ibb.co/Myx1Nftm/IMG-6648.jpg",
        caption: "Créations modernes"
      },
      {
        id: 4,
        image: "https://i.ibb.co/4rVfCDW/IMG-6649.jpg",
        caption: "Motifs délicats"
      },
      {
        id: 5,
        image: "https://i.ibb.co/GfDt5V0M/IMG-6650.jpg",
        caption: "Art floral"
      },
      {
        id: 6,
        image: "https://i.ibb.co/4rVfCDW/IMG-6649.jpg",
        caption: "Géométrie sacrée"
      }
    ];

    return (
      <div className="container">
        <section className="gallery">
          <div className="section-header">
            <h2>Galerie de Créations</h2>
            <p>Découvrez mes dernières réalisations et laissez-vous inspirer</p>
          </div>
          
          <div className="gallery-grid modern-gallery">
            {galleryImages.map((item) => (
              <div key={item.id} className="gallery-item modern-gallery-item">
                <img 
                  src={item.image} 
                  alt={item.caption}
                />
                <div className="gallery-overlay modern-overlay">
                  <p className="gallery-caption">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="gallery-cta">
            <a 
              href="https://instagram.com/hennaa.lash" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary btn-lg"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8A4 4 0 0 1 16 11.37Z"/>
                <path d="M17.5 6.5H17.51"/>
              </svg>
              Suivre @hennaa.lash
            </a>
            
            <button 
              className="btn btn-outline btn-lg"
              onClick={() => setCurrentSection('appointment')}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <path d="M16 2V6"/>
                <path d="M8 2V6"/>
                <path d="M3 10H21"/>
              </svg>
              Réserver votre séance
            </button>
          </div>
        </section>
      </div>
    );
  };

  // Reviews section - Nouvelle section
  const ReviewsSection = () => (
    <div className="container">
      <section className="reviews">
        <div className="section-header">
          <h2>Avis de nos Clientes</h2>
          <p>Découvrez ce que pensent nos clientes de nos prestations</p>
        </div>
        
        <div className="reviews-grid">
          {reviews.length === 0 ? (
            <div className="no-reviews">
              <svg className="icon icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <p>Pas encore d'avis publiés</p>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="review-card modern-card">
                <div className="review-header">
                  <div className="review-stars">
                    {[...Array(5)].map((_, i) => (
                      <svg 
                        key={i} 
                        className={`star ${i < review.rating ? 'filled' : ''}`}
                        viewBox="0 0 24 24" 
                        fill={i < review.rating ? "currentColor" : "none"} 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    ))}
                  </div>
                  <span className="review-service">{review.service_type}</span>
                </div>
                <p className="review-comment">"{review.comment}"</p>
                <div className="review-author">
                  <strong>{review.client_name}</strong>
                  <span className="review-date">
                    {new Date(review.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="review-form-section">
          <div className="modern-card">
            <h3>Partagez votre expérience</h3>
            <p>Vous avez bénéficié de nos services ? Laissez-nous un avis !</p>
            
            <form onSubmit={handleCreateReview} className="review-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Votre nom</label>
                  <input
                    type="text"
                    name="client_name"
                    value={newReview.client_name}
                    onChange={handleReviewChange}
                    required
                    className="form-input"
                    placeholder="Votre prénom"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Service reçu</label>
                  <select
                    name="service_type"
                    value={newReview.service_type}
                    onChange={handleReviewChange}
                    required
                    className="form-select"
                  >
                    <option value="simple">Henné Simple</option>
                    <option value="moyen">Henné Moyen</option>
                    <option value="charge">Henné Chargé</option>
                    <option value="mariee">Henné Mariée</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Note (sur 5)</label>
                <div className="rating-selector">
                  {[1,2,3,4,5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star-btn ${star <= newReview.rating ? 'active' : ''}`}
                      onClick={() => setNewReview(prev => ({...prev, rating: star}))}
                    >
                      <svg className="star" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Votre commentaire</label>
                <textarea
                  name="comment"
                  value={newReview.comment}
                  onChange={handleReviewChange}
                  required
                  rows="4"
                  className="form-textarea"
                  placeholder="Partagez votre expérience..."
                />
              </div>
              
              <button type="submit" className="btn btn-primary btn-lg" style={{width: '100%'}}>
                Publier mon avis
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );

  // Client Login Section
  const ClientLoginSection = () => (
    <div className="client-login">
      <div className="client-login-card modern-card">
        <h2>
          <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21V19C20 17.9 19.1 17 18 17H6C4.9 17 4 17.9 4 19V21"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          Mon Espace Client
        </h2>
        <p>Connectez-vous pour voir l'historique de vos rendez-vous</p>
        
        <form onSubmit={handleClientLogin} className="form">
          <div className="form-group">
            <label htmlFor="client_email" className="form-label">Email utilisé pour vos rendez-vous</label>
            <input
              type="email"
              id="client_email"
              name="email"
              value={clientLogin.email}
              onChange={handleClientLoginChange}
              required
              placeholder="votre@email.com"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="client_phone" className="form-label">Numéro de téléphone</label>
            <input
              type="tel"
              id="client_phone"
              name="phone"
              value={clientLogin.phone}
              onChange={handleClientLoginChange}
              required
              placeholder="06 12 34 56 78"
              className="form-input"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{width: '100%'}}>
            Accéder à mon espace
          </button>
        </form>
        
        <div className="login-help">
          <p><small>Vous retrouverez ici tous les rendez-vous pris avec ces informations.</small></p>
        </div>
      </div>
    </div>
  );

  // Client Space Section
  const ClientSpaceSection = () => (
    <div className="container">
      <section className="client-space">
        <div className="client-header">
          <h2>
            <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21V19C20 17.9 19.1 17 18 17H6C4.9 17 4 17.9 4 19V21"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Bonjour {clientInfo?.client_name || 'Cliente'} !
          </h2>
          <div className="client-actions">
            <button 
              onClick={() => setCurrentSection('appointment')}
              className="btn btn-primary"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <path d="M16 2V6"/>
                <path d="M8 2V6"/>
                <path d="M3 10H21"/>
              </svg>
              Nouveau rendez-vous
            </button>
            <button 
              onClick={() => {
                setIsClientLoggedIn(false);
                setClientInfo(null);
                setClientAppointments([]);
                setCurrentSection('home');
              }}
              className="btn btn-secondary"
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5C4.45 21 4 20.55 4 20V4C4 3.45 4.45 3 5 3H9"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Déconnexion
            </button>
          </div>
        </div>
        
        <div className="client-stats">
          <div className="stat-card">
            <h3>{clientAppointments.length}</h3>
            <p>Rendez-vous total</p>
          </div>
          <div className="stat-card">
            <h3>{clientAppointments.filter(a => a.status === 'confirmed').length}</h3>
            <p>Confirmés</p>
          </div>
          <div className="stat-card">
            <h3>{clientAppointments.filter(a => a.status === 'pending').length}</h3>
            <p>En attente</p>
          </div>
        </div>
        
        <div className="client-appointments modern-card">
          <h3>
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <path d="M16 2V6"/>
              <path d="M8 2V6"/>
              <path d="M3 10H21"/>
            </svg>
            Historique de vos rendez-vous
          </h3>
          
          {clientAppointments.length === 0 ? (
            <p style={{textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '2rem'}}>
              Aucun rendez-vous trouvé
            </p>
          ) : (
            <div className="appointments-grid">
              {clientAppointments.map((appointment) => (
                <div key={appointment.id} className={`appointment-item client-appointment ${appointment.status}`}>
                  <div className="appointment-header">
                    <h4>{appointment.service_type.toUpperCase()}</h4>
                    <span className={`status-badge ${appointment.status}`}>
                      {appointment.status === 'pending' ? 'En attente' : 
                       appointment.status === 'confirmed' ? 'Confirmé' : 'Annulé'}
                    </span>
                  </div>
                  <div className="appointment-details">
                    <p><strong>Date:</strong> {new Date(appointment.appointment_date).toLocaleDateString('fr-FR')}</p>
                    <p><strong>Heure:</strong> {appointment.appointment_time}</p>
                    <p><strong>Lieu:</strong> {appointment.location_type === 'domicile' ? 'À domicile' : 'En atelier'}</p>
                    {appointment.address && <p><strong>Adresse:</strong> {appointment.address}</p>}
                    {appointment.additional_notes && <p><strong>Notes:</strong> {appointment.additional_notes}</p>}
                    <p><strong>Créé le:</strong> {new Date(appointment.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  // Services section - Inchangée (conserve la logique existante)
  const ServicesSection = () => (
    <div className="container">
      <section className="services">
        <div className="section-header">
          <h2>Services & Tarifs</h2>
          <p>Prestations professionnelles adaptées à tous vos besoins</p>
        </div>
        
        {loadingServices ? (
          <div className="loading">
            <svg className="icon" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M21 12A9 9 0 1 1 6.7 3.5"/>
            </svg>
            Chargement des tarifs...
          </div>
        ) : Object.keys(services).length === 0 ? (
          <div className="error">
            <p>Impossible de charger les tarifs. Veuillez rafraîchir la page.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="btn btn-primary"
              style={{marginTop: '1rem'}}
            >
              Rafraîchir
            </button>
          </div>
        ) : (
          <>
            <div className="service-grid">
              {Object.entries(services).map(([key, service]) => (
                <div key={key} className="service-card modern-card">
                  <div className="service-header">
                    <h3 className="service-name">{service.name}</h3>
                    <div className="service-price">
                      {service.price}€
                      {service.note && <span className="service-note">{service.note}</span>}
                    </div>
                  </div>
                  <div className="service-duration">
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12,6 12,12 16,14"/>
                    </svg>
                    {service.duration}
                  </div>
                  <div className="service-description">
                    {key === 'simple' && "Parfait pour découvrir le henné avec des motifs simples et élégants"}
                    {key === 'moyen' && "Motifs plus élaborés pour un rendu plus sophistiqué"}
                    {key === 'charge' && "Créations complexes couvrant une large surface"}
                    {key === 'mariee' && "Henné traditionnel pour mariée avec motifs détaillés"}
                  </div>
                  <button 
                    className="btn btn-primary"
                    onClick={() => setCurrentSection('appointment')}
                    style={{width: '100%'}}
                  >
                    Choisir ce service
                  </button>
                </div>
              ))}
            </div>
            
            <div className="service-features">
              <div className="modern-card">
                <div className="card-body">
                  <h3 style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem'}}>
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7V10C2 16 6 21 12 22C18 21 22 16 22 10V7L12 2Z"/>
                    </svg>
                    Henné 100% Naturel
                  </h3>
                  <p>J'utilise exclusivement du henné de qualité premium, sans produits chimiques, pour une couleur riche et durable.</p>
                </div>
              </div>
              <div className="modern-card">
                <div className="card-body">
                  <h3 style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem'}}>
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                    </svg>
                    Motifs Personnalisés
                  </h3>
                  <p>Chaque création est unique et adaptée à vos goûts, l'occasion et vos souhaits personnels.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );

  // Appointment section - Inchangée (conserve la logique existante)
  const AppointmentSection = React.useMemo(() => (
    <div className="container">
      <section className="appointment">
        <div className="section-header">
          <h2>Réserver votre séance</h2>
          <p>Prenez rendez-vous en quelques clics et recevez une confirmation par email</p>
        </div>
        <div className="appointment-container">
          <div className="appointment-form modern-card">
            <form onSubmit={handleSubmitAppointment} className="form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="client_name" className="form-label">Nom complet *</label>
                  <input
                    type="text"
                    id="client_name"
                    name="client_name"
                    value={formData.client_name}
                    onChange={handleInputChange}
                    required
                    placeholder="Votre nom complet"
                    autoComplete="name"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="client_email" className="form-label">Email *</label>
                  <input
                    type="email"
                    id="client_email"
                    name="client_email"
                    value={formData.client_email}
                    onChange={handleInputChange}
                    required
                    placeholder="votre@email.com"
                    autoComplete="email"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="client_phone" className="form-label">Téléphone *</label>
                  <input
                    type="tel"
                    id="client_phone"
                    name="client_phone"
                    value={formData.client_phone}
                    onChange={handleInputChange}
                    required
                    placeholder="06 12 34 56 78"
                    autoComplete="tel"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="client_instagram" className="form-label">Instagram (optionnel)</label>
                  <input
                    type="text"
                    id="client_instagram"
                    name="client_instagram"
                    value={formData.client_instagram}
                    onChange={handleInputChange}
                    placeholder="votre_pseudo"
                    autoComplete="off"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="service_type" className="form-label">Type de service *</label>
                <select
                  id="service_type"
                  name="service_type"
                  value={formData.service_type}
                  onChange={handleInputChange}
                  required
                  className="form-select"
                >
                  <option value="simple">Henné Simple (~5€ par main)</option>
                  <option value="moyen">Henné Moyen (~8€ par main)</option>
                  <option value="charge">Henné Chargé (~12€ par main)</option>
                  <option value="mariee">Henné Mariée (20€ par main)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="appointment_slot" className="form-label">Créneau disponible *</label>
                <select
                  id="appointment_slot"
                  name="appointment_slot"
                  value={formData.appointment_date && formData.appointment_time ? `${formData.appointment_date}|${formData.appointment_time}` : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [date, time] = e.target.value.split('|');
                      setFormData(prev => ({
                        ...prev,
                        appointment_date: date,
                        appointment_time: time
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        appointment_date: '',
                        appointment_time: ''
                      }));
                    }
                  }}
                  required
                  className="form-select"
                >
                  <option value="">Sélectionnez un créneau</option>
                  {availableSlots
                    .filter(slot => slot.is_available)
                    .map(slot => (
                      <option key={slot.id} value={`${slot.date}|${slot.time}`}>
                        {new Date(slot.date).toLocaleDateString('fr-FR')} à {slot.time}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="location_type" className="form-label">Lieu du rendez-vous *</label>
                <select
                  id="location_type"
                  name="location_type"
                  value={formData.location_type}
                  onChange={handleInputChange}
                  required
                  className="form-select"
                >
                  <option value="domicile">À domicile (je me déplace)</option>
                  <option value="deplacement">En atelier (vous venez)</option>
                </select>
              </div>

              {formData.location_type === 'domicile' && (
                <div className="form-group">
                  <label htmlFor="address" className="form-label">Adresse complète *</label>
                  <textarea
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Votre adresse complète"
                    required
                    rows="2"
                    className="form-textarea"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="additional_notes" className="form-label">Vos souhaits particuliers</label>
                <textarea
                  id="additional_notes"
                  name="additional_notes"
                  value={formData.additional_notes}
                  onChange={handleInputChange}
                  placeholder="Décrivez vos préférences..."
                  rows="3"
                  className="form-textarea"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-lg" style={{width: '100%'}}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12L10 17L20 7"/>
                </svg>
                Confirmer ma réservation
              </button>
            </form>
          </div>
          
          <div className="appointment-info modern-card">
            <h3>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12L11 14L15 10"/>
                <path d="M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z"/>
              </svg>
              Informations pratiques
            </h3>
            <ul>
              <li>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10C21 17 12 23 12 23S3 17 3 10C3 6 7 3 12 3S21 6 21 10Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Secteur 27/28 (Eure)
              </li>
              <li>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12,6 12,12 16,14"/>
                </svg>
                Disponible 7j/7
              </li>
              <li>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7V10C2 16 6 21 12 22C18 21 22 16 22 10V7L12 2Z"/>
                </svg>
                Henné 100% naturel
              </li>
              <li>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Confirmation par email
              </li>
            </ul>
            <div className="contact-urgency">
              <h4>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18A2 2 0 0 0 3.5 21H20.5A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Question ?
              </h4>
              <a href="https://instagram.com/hennaa.lash" target="_blank" rel="noopener noreferrer">
                Contactez-moi sur Instagram
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  ), [formData, handleInputChange, handleSubmitAppointment, availableSlots]);

  // Contact section - Inchangée
  const ContactSection = () => (
    <div className="container">
      <section className="contact">
        <div className="section-header">
          <h2>Contact</h2>
          <p>Pour toute question ou demande spéciale</p>
        </div>
        <div className="contact-grid">
          <div className="contact-card modern-card">
            <h3>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10C21 17 12 23 12 23S3 17 3 10C3 6 7 3 12 3S21 6 21 10Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Zone de service
            </h3>
            <p><strong>Secteur 27/28 (Eure)</strong></p>
            <p>Service à domicile</p>
            <p>Frais de déplacement inclus</p>
          </div>
          
          <div className="contact-card modern-card">
            <h3>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8A4 4 0 0 1 16 11.37Z"/>
                <path d="M17.5 6.5H17.51"/>
              </svg>
              Réseaux sociaux
            </h3>
            <p>
              <a 
                href="https://instagram.com/hennaa.lash" 
                target="_blank" 
                rel="noopener noreferrer"
                className="social-link"
              >
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8A4 4 0 0 1 16 11.37Z"/>
                  <path d="M17.5 6.5H17.51"/>
                </svg>
                @hennaa.lash
              </a>
            </p>
            <p>Suivez-moi pour découvrir mes dernières créations</p>
          </div>
          
          <div className="contact-card modern-card">
            <h3>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
              Horaires
            </h3>
            <p><strong>Disponible 7j/7</strong></p>
            <p>Séances de 30 minutes à 2 heures</p>
            <p>Rendez-vous flexibles</p>
          </div>
        </div>
      </section>
    </div>
  );

  // Admin login section - Inchangée
  const AdminLoginSection = React.useMemo(() => (
    <div className="admin-login">
      <div className="admin-login-card modern-card">
        <h2>
          <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <circle cx="12" cy="16" r="1"/>
            <path d="M7 11V7C7 5.67 7.67 4 12 4S17 5.67 17 7V11"/>
          </svg>
          Accès Administrateur
        </h2>
        <form onSubmit={handleAdminLogin} className="form">
          <div className="form-group">
            <label htmlFor="admin_password" className="form-label">Mot de passe</label>
            <input
              type="password"
              id="admin_password"
              name="admin_password"
              value={adminPassword}
              onChange={handleAdminPasswordChange}
              required
              placeholder="Entrez votre mot de passe"
              className="form-input"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{width: '100%'}}>
            Se connecter
          </button>
        </form>
      </div>
    </div>
  ), [adminPassword, handleAdminLogin, handleAdminPasswordChange]);

  // Admin section - Étendue avec gestion des avis
  const AdminSection = React.useMemo(() => (
    <div className="admin">
      <div className="admin-header">
        <h2>
          <svg className="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <path d="M16 2V6"/>
            <path d="M8 2V6"/>
            <path d="M3 10H21"/>
          </svg>
          Dashboard Admin
        </h2>
        <div className="admin-actions">
          <button 
            onClick={fetchAppointments} 
            className="btn btn-secondary"
            disabled={loadingAppointments}
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M22.88 14.36A9 9 0 0 1 5.51 15L23 4"/>
            </svg>
            {loadingAppointments ? 'Chargement...' : 'Actualiser'}
          </button>
          <button onClick={() => setIsAdmin(false)} className="btn btn-secondary">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5C4.45 21 4 20.55 4 20V4C4 3.45 4.45 3 5 3H9"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Déconnexion
          </button>
        </div>
      </div>
      
      <div className="admin-stats">
        <div className="stat-card">
          <h3>{appointments.length}</h3>
          <p>RDV Total</p>
        </div>
        <div className="stat-card">
          <h3>{appointments.filter(a => a.status === 'pending').length}</h3>
          <p>En attente</p>
        </div>
        <div className="stat-card">
          <h3>{appointments.filter(a => a.status === 'confirmed').length}</h3>
          <p>Confirmés</p>
        </div>
        <div className="stat-card">
          <h3>{reviews.filter(r => r.is_published).length}</h3>
          <p>Avis publiés</p>
        </div>
      </div>

      {/* Gestion des avis clients */}
      <div className="admin-section-card">
        <h3>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Gestion des avis clients ({reviews.length})
        </h3>
        
        {reviews.length === 0 ? (
          <p style={{textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '2rem'}}>
            Aucun avis reçu
          </p>
        ) : (
          <div className="reviews-admin-grid">
            {reviews.map((review) => (
              <div key={review.id} className={`review-admin-item ${review.is_published ? 'published' : 'unpublished'}`}>
                <div className="review-admin-header">
                  <div className="review-stars">
                    {[...Array(5)].map((_, i) => (
                      <svg 
                        key={i} 
                        className={`star ${i < review.rating ? 'filled' : ''}`}
                        viewBox="0 0 24 24" 
                        fill={i < review.rating ? "currentColor" : "none"} 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    ))}
                  </div>
                  <span className={`publication-status ${review.is_published ? 'published' : 'unpublished'}`}>
                    {review.is_published ? 'Publié' : 'En attente'}
                  </span>
                </div>
                <p className="review-comment">"{review.comment}"</p>
                <div className="review-info">
                  <strong>{review.client_name}</strong> - {review.service_type}
                  <span className="review-date">
                    {new Date(review.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div className="review-actions">
                  <button 
                    onClick={() => toggleReviewPublication(review.id, review.is_published)}
                    className={`btn ${review.is_published ? 'btn-secondary' : 'btn-primary'}`}
                  >
                    {review.is_published ? 'Dépublier' : 'Publier'}
                  </button>
                  <button 
                    onClick={() => deleteReview(review.id)}
                    className="btn btn-danger"
                  >
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/>
                      <path d="M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gestion des créneaux - existant */}
      <div className="admin-section-card">
        <h3>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <path d="M16 2V6"/>
            <path d="M8 2V6"/>
            <path d="M3 10H21"/>
          </svg>
          Gestion des créneaux
        </h3>
        
        <form onSubmit={addTimeSlot} className="slot-form">
          <input
            type="date"
            name="date"
            value={newSlot.date}
            onChange={handleNewSlotChange}
            required
          />
          <input
            type="time"
            name="time"
            value={newSlot.time}
            onChange={handleNewSlotChange}
            required
          />
          <button type="submit" className="btn btn-primary">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Ajouter
          </button>
        </form>

        <div className="slots-grid">
          {availableSlots.length === 0 ? (
            <p style={{textAlign: 'center', color: '#6b7280', fontStyle: 'italic'}}>
              Aucun créneau créé
            </p>
          ) : (
            availableSlots
              .sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                if (dateA.getTime() === dateB.getTime()) {
                  return a.time.localeCompare(b.time);
                }
                return dateA.getTime() - dateB.getTime();
              })
              .map(slot => (
                <div key={slot.id} className={`slot-item ${slot.is_available ? 'available' : 'booked'}`}>
                  <div className="slot-info">
                    <span className="slot-datetime">
                      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <path d="M16 2V6"/>
                        <path d="M8 2V6"/>
                        <path d="M3 10H21"/>
                      </svg>
                      {new Date(slot.date).toLocaleDateString('fr-FR')} à {slot.time}
                    </span>
                    <span className={`slot-status ${slot.is_available ? 'available' : 'booked'}`}>
                      {slot.is_available ? (
                        <>
                          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12L10 17L20 7"/>
                          </svg>
                          Disponible
                        </>
                      ) : (
                        <>
                          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                          </svg>
                          Réservé
                        </>
                      )}
                    </span>
                  </div>
                  <button 
                    onClick={() => deleteTimeSlot(slot.id)}
                    className="btn btn-secondary btn-sm"
                    title="Supprimer ce créneau"
                  >
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/>
                      <path d="M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6"/>
                    </svg>
                  </button>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Gestion des rendez-vous - existant */}
      <div className="admin-section-card">
        <h3>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <path d="M16 2V6"/>
            <path d="M8 2V6"/>
            <path d="M3 10H21"/>
          </svg>
          Rendez-vous ({appointments.length})
        </h3>
        
        <div className="appointments-grid">
          {loadingAppointments ? (
            <div className="loading">
              <svg className="icon" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M21 12A9 9 0 1 1 6.7 3.5"/>
              </svg>
              Chargement des rendez-vous...
            </div>
          ) : appointments.length === 0 ? (
            <p style={{textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '2rem'}}>
              Aucun rendez-vous
            </p>
          ) : (
            appointments.map((appointment) => (
              <div key={appointment.id} className={`appointment-item ${appointment.status}`}>
                <div className="appointment-header">
                  <h4>{appointment.client_name}</h4>
                  <span className={`status-badge ${appointment.status}`}>
                    {appointment.status === 'pending' ? 'En attente' : 
                     appointment.status === 'confirmed' ? 'Confirmé' : 'Annulé'}
                  </span>
                </div>
                <div className="appointment-details">
                  <p><strong>Email:</strong> {appointment.client_email}</p>
                  <p><strong>Téléphone:</strong> {appointment.client_phone}</p>
                  {appointment.client_instagram && (
                    <p>
                      <strong>Instagram:</strong> 
                      <a href={`https://instagram.com/${appointment.client_instagram}`} target="_blank" rel="noopener noreferrer" className="instagram-link">
                        @{appointment.client_instagram}
                      </a>
                    </p>
                  )}
                  <p><strong>Service:</strong> {appointment.service_type}</p>
                  <p><strong>Date:</strong> {new Date(appointment.appointment_date).toLocaleDateString('fr-FR')}</p>
                  <p><strong>Heure:</strong> {appointment.appointment_time}</p>
                  <p><strong>Lieu:</strong> {appointment.location_type === 'domicile' ? 'À domicile' : 'En atelier'}</p>
                  {appointment.address && <p><strong>Adresse:</strong> {appointment.address}</p>}
                  {appointment.additional_notes && <p><strong>Notes:</strong> {appointment.additional_notes}</p>}
                </div>
                {appointment.status === 'pending' && (
                  <div className="appointment-actions">
                    <button 
                      onClick={() => updateAppointmentStatus(appointment.id, 'confirmed')}
                      className="btn btn-primary"
                      disabled={updatingAppointment === appointment.id}
                    >
                      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12L10 17L20 7"/>
                      </svg>
                      Confirmer
                    </button>
                    <button 
                      onClick={() => updateAppointmentStatus(appointment.id, 'cancelled')}
                      className="btn btn-secondary"
                      disabled={updatingAppointment === appointment.id}
                    >
                      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ), [appointments, reviews, loadingAppointments, updatingAppointment, fetchAppointments, updateAppointmentStatus, availableSlots, newSlot, handleNewSlotChange, addTimeSlot, deleteTimeSlot, toggleReviewPublication, deleteReview]);

  // Render current section
  const renderSection = () => {
    switch (currentSection) {
      case 'gallery':
        return <GallerySection />;
      case 'services':
        return <ServicesSection />;
      case 'appointment':
        return AppointmentSection;
      case 'reviews':
        return <ReviewsSection />;
      case 'contact':
        return <ContactSection />;
      case 'client-login':
        return <ClientLoginSection />;
      case 'client-space':
        return isClientLoggedIn ? <ClientSpaceSection /> : <ClientLoginSection />;
      case 'admin-login':
        return AdminLoginSection;
      case 'admin':
        return isAdmin ? AdminSection : AdminLoginSection;
      default:
        return <HomeSection />;
    }
  };

  return (
    <div className="App">
      <Navigation />
      <main className="main-content">
        {renderSection()}
      </main>
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7V10C2 16 6 21 12 22C18 21 22 16 22 10V7L12 2Z"/>
              </svg>
              Hennaa.lash
            </h3>
            <p>Artiste Henné professionnelle • Secteur 27/28</p>
          </div>
          <div className="footer-links">
            <a href="https://instagram.com/hennaa.lash" target="_blank" rel="noopener noreferrer">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8A4 4 0 0 1 16 11.37Z"/>
                <path d="M17.5 6.5H17.51"/>
              </svg>
              Suivez-nous sur Instagram
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 Hennaa.lash - Tous droits réservés</p>
        </div>
      </footer>
    </div>
  );
};

export default App;