import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, User, CheckCircle, X } from 'lucide-react';

interface ProfileCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleteProfile: () => void;
  profileCompletion: number;
  missingFields: string[];
  swipesUsedToday: number;
  swipeLimit: number;
}

const ProfileCompletionModal: React.FC<ProfileCompletionModalProps> = ({
  isOpen,
  onClose,
  onCompleteProfile,
  profileCompletion,
  missingFields,
  swipesUsedToday,
  swipeLimit
}) => {
  if (!isOpen) return null;

  const remainingSwipes = swipeLimit - swipesUsedToday;
  const requiredCompletion = 70;
  const completionDeficit = requiredCompletion - profileCompletion;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="max-w-md w-full mx-4 animate-fade-in">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-orange-100 rounded-full">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-gray-800">
            Complete Your Profile to Continue
          </CardTitle>
          <CardDescription className="text-gray-600">
            You've used {swipesUsedToday} of your daily swipes. Complete your profile so others can see you better and connect with real people who share your interests!
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Current Profile Completion */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Profile Completion</span>
              <span className="text-sm font-semibold text-gray-800">{profileCompletion}%</span>
            </div>
            <Progress value={profileCompletion} className="h-3" />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Current: {profileCompletion}%</span>
              <span>Required: {requiredCompletion}%</span>
            </div>
          </div>

          {/* Progress Needed */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <User className="w-4 h-4 text-blue-600 mr-2" />
              <span className="text-sm font-medium text-blue-900">
                You need {completionDeficit}% more to continue swiping
              </span>
            </div>
            <p className="text-xs text-blue-700 mb-2">
              Complete your profile so others can see the real you!
            </p>
            <p className="text-xs font-medium text-purple-700">
              ✨ This helps you connect with genuine people who share your interests and values
            </p>
          </div>

          {/* Missing Fields Preview */}
          {missingFields.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-800">Missing Information:</h4>
              <div className="space-y-1">
                {missingFields.slice(0, 4).map((field, index) => (
                  <div key={index} className="flex items-center text-sm text-gray-600">
                    <X className="w-3 h-3 text-red-500 mr-2 flex-shrink-0" />
                    <span>{field}</span>
                  </div>
                ))}
                {missingFields.length > 4 && (
                  <div className="text-xs text-gray-500 ml-5">
                    +{missingFields.length - 4} more items...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Swipe Status */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Daily Swipes</span>
              <span className="text-sm font-medium text-gray-800">
                {swipesUsedToday}/{swipeLimit}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {remainingSwipes > 0 
                ? `${remainingSwipes} swipes remaining today`
                : 'No swipes remaining today'
              }
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button 
              onClick={onCompleteProfile}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3"
            >
              <User className="w-4 h-4 mr-2" />
              Complete Profile
            </Button>
            
            <Button 
              onClick={onClose}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Maybe Later
            </Button>
          </div>

          {/* Benefits Note */}
          <div className="text-center bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-center mb-2">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              <span className="text-sm font-semibold text-green-700">Why complete your profile?</span>
            </div>
            <div className="space-y-1 text-xs text-green-700 leading-relaxed">
              <p>🌟 <strong>Others can see the real you</strong> - Show your personality & interests</p>
              <p>💝 <strong>Connect with genuine people</strong> - Find those who truly match with you</p>
              <p>🚀 <strong>Unlock unlimited swipes</strong> - Continue discovering amazing connections</p>
              <p>📈 <strong>Better visibility</strong> - Appear higher in others' search results</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileCompletionModal;
