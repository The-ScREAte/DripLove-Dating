
import React, { useState } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthForm from '@/components/AuthForm';
import Dashboard from '@/components/Dashboard';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [currentView, setCurrentView] = useState<'welcome' | 'auth' | 'dashboard'>('welcome');
  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  const handleGetStarted = () => {
    setCurrentView('auth');
  };

  const handleToggleAuth = () => {
    setIsLogin(!isLogin);
  };

  const handleAuthSubmit = (formData: any) => {
    console.log('Auth form submitted:', formData);
    
    // Simulate authentication
    if (isLogin) {
      // Simulate login
      toast({
        title: "Welcome back!",
        description: "You've been successfully logged in.",
      });
      setUser({ 
        name: "Demo User", 
        email: formData.email 
      });
    } else {
      // Simulate registration
      if (formData.password !== formData.confirmPassword) {
        toast({
          title: "Error",
          description: "Passwords don't match. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Account created!",
        description: "Welcome to LoveConnect! Your journey begins now.",
      });
      setUser({ 
        name: formData.name, 
        email: formData.email,
        age: formData.age 
      });
    }
    
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('welcome');
    toast({
      title: "Logged out",
      description: "See you again soon!",
    });
  };

  if (currentView === 'welcome') {
    return <WelcomeScreen onGetStarted={handleGetStarted} />;
  }

  if (currentView === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
        <AuthForm 
          isLogin={isLogin}
          onToggle={handleToggleAuth}
          onSubmit={handleAuthSubmit}
        />
      </div>
    );
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
};

export default Index;
