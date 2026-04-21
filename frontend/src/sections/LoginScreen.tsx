import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { Lock, User, Eye, EyeOff, AlertTriangle, Shield, Building2, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export function LoginScreen() {
  const { login, isLoading, resetPassword } = useAuth();
  const { stations, users } = useUsers();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedStation, setSelectedStation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loginAttempts, setLoginAttempts] = useState(0);
  
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'request' | 'verify' | 'success'>('request');
  const [forgotUsername, setForgotUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Demo credentials hint
  const demoUsers = [
    { username: 'jmartinez', role: 'System Administrator', name: 'James Martinez' },
    { username: 'sjohnson', role: 'Nurse Manager', name: 'Sarah Johnson' },
    { username: 'mchen', role: 'Nurse', name: 'Michael Chen' },
    { username: 'dwilliams', role: 'Physician', name: 'David Williams' },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    const result = await login({
      username: username.trim(),
      password: password.trim(),
      stationId: selectedStation || undefined,
    });

    if (!result.success) {
      setError(result.error || 'Login failed');
      setLoginAttempts(prev => prev + 1);
      
      if (loginAttempts >= 3) {
        toast.error('Multiple failed login attempts detected. Account may be locked after 5 attempts.');
      }
    }
  };

  const fillDemoCredentials = (demoUser: typeof demoUsers[0]) => {
    setUsername(demoUser.username);
    setPassword('password123'); // Demo password
    setError(null);
  };

  // Handle forgot password request
  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    
    if (!forgotUsername.trim()) {
      toast.error('Please enter your username');
      setIsResetting(false);
      return;
    }
    
    // In a real app, this would send an email/SMS with a reset code
    // For demo, we simulate by checking if user exists
    const user = users.find(u => u.credentials.username === forgotUsername.trim());
    
    if (!user) {
      toast.error('User not found. Please check your username.');
      setIsResetting(false);
      return;
    }
    
    if (user.status !== 'active') {
      toast.error('Account is not active. Please contact administrator.');
      setIsResetting(false);
      return;
    }
    
    // Simulate sending reset code
    toast.success('Password reset instructions sent', {
      description: `A reset code has been sent to ${user.email}. For demo, use code: 123456`,
    });
    
    setForgotPasswordStep('verify');
    setIsResetting(false);
  };

  // Handle password reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    
    if (!resetToken.trim()) {
      toast.error('Please enter the reset code');
      setIsResetting(false);
      return;
    }
    
    if (resetToken !== '123456') {
      toast.error('Invalid reset code');
      setIsResetting(false);
      return;
    }
    
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      setIsResetting(false);
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      setIsResetting(false);
      return;
    }
    
    // Call the reset password function
    const result = await resetPassword(forgotUsername, resetToken, newPassword);
    
    if (result.success) {
      toast.success('Password reset successful', {
        description: 'You can now log in with your new password.',
      });
      setForgotPasswordStep('success');
    } else {
      toast.error(result.error || 'Failed to reset password');
    }
    
    setIsResetting(false);
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setForgotPasswordStep('request');
    setForgotUsername('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003366] to-[#002244] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Header */}
        <div className="text-center space-y-3">
          {/* KCH Logo */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-white shadow-xl">
            <svg viewBox="0 0 60 60" className="w-14 h-14">
              <circle cx="30" cy="30" r="26" fill="none" stroke="#C9A227" strokeWidth="3"/>
              <text x="30" y="38" textAnchor="middle" fill="#003366" fontSize="16" fontWeight="bold">KCH</text>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">King's College Hospital</h1>
            <p className="text-[#C9A227] font-medium">Jeddah</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-[#C9A227] text-[#003366] border-[#C9A227] font-semibold flex items-center gap-1">
              <Shield className="w-3 h-3" />
              HIMSS 6 Compliant
            </Badge>
          </div>
          <p className="text-slate-300">Human Milk Tracker - NICU Clinical System</p>
        </div>

        {/* Login Card */}
        <Card className="border-white/20 shadow-2xl bg-white/95 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-center text-[#003366]">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {/* Error Alert */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs text-[#003366] hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Station Selection */}
              <div className="space-y-2">
                <Label htmlFor="station" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Work Station (Optional)
                </Label>
                <Select value={selectedStation} onValueChange={setSelectedStation}>
                  <SelectTrigger id="station">
                    <SelectValue placeholder="Select your station" />
                  </SelectTrigger>
                  <SelectContent>
                    {stations.filter(s => s.isActive).map((station) => (
                      <SelectItem key={station.id} value={station.id}>
                        {station.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Security Notice */}
              <div className="p-3 bg-[#003366]/10 border border-[#003366]/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-[#003366] flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-[#003366] space-y-1">
                    <p className="font-medium">Security Notice:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Session expires after 15 minutes of inactivity</li>
                      <li>Account locks after 5 failed login attempts</li>
                      <li>All actions are logged for audit compliance</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button 
                type="submit" 
                className="w-full bg-[#003366] hover:bg-[#002244] text-white" 
                disabled={isLoading || !username.trim() || !password.trim()}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
              
              <p className="text-xs text-center text-slate-400">
                By signing in, you agree to comply with hospital policies and HIPAA regulations.
              </p>
            </CardFooter>
          </form>
        </Card>

        {/* Demo Credentials */}
        <Card className="border-dashed border-white/30 bg-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80">Demo Credentials</CardTitle>
            <CardDescription className="text-xs text-white/60">
              Click to auto-fill credentials for testing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {demoUsers.map((demoUser) => (
                <button
                  key={demoUser.username}
                  onClick={() => fillDemoCredentials(demoUser)}
                  className="p-2 text-left text-xs bg-white/90 hover:bg-white rounded border border-white/50 transition-colors"
                >
                  <span className="font-medium text-[#003366]">{demoUser.name}</span>
                  <span className="text-slate-500 block">{demoUser.username}</span>
                  <Badge variant="outline" className="mt-1 text-[10px] border-[#003366] text-[#003366]">{demoUser.role}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-white/60 space-y-1">
          <p className="text-[#C9A227] font-medium">King's College Hospital Jeddah</p>
          <p>Human Milk Tracker • HIMSS 6 Compliant</p>
          <p>FHIR R4 • HL7 v2.x • Closed-Loop Integration</p>
          <p className="mt-2">© 2025 King's College Hospital Jeddah. All rights reserved.</p>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={closeForgotPassword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#003366]" />
              {forgotPasswordStep === 'request' && 'Reset Your Password'}
              {forgotPasswordStep === 'verify' && 'Enter Reset Code'}
              {forgotPasswordStep === 'success' && 'Password Reset Complete'}
            </DialogTitle>
            <DialogDescription>
              {forgotPasswordStep === 'request' && 'Enter your username to receive password reset instructions.'}
              {forgotPasswordStep === 'verify' && 'Enter the reset code sent to your email and create a new password.'}
              {forgotPasswordStep === 'success' && 'Your password has been reset successfully.'}
            </DialogDescription>
          </DialogHeader>

          {forgotPasswordStep === 'request' && (
            <form onSubmit={handleForgotPasswordRequest}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="forgot-username"
                      placeholder="Enter your username"
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      className="pl-10"
                      disabled={isResetting}
                    />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                  <strong>Demo Mode:</strong> Use any valid username. The reset code will be <strong>123456</strong>.
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForgotPassword} disabled={isResetting}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#003366] hover:bg-[#002244]" disabled={isResetting}>
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Code'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {forgotPasswordStep === 'verify' && (
            <form onSubmit={handleResetPassword}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-code">Reset Code</Label>
                  <Input
                    id="reset-code"
                    placeholder="Enter reset code (use 123456 for demo)"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    disabled={isResetting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter new password (min 8 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={isResetting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="confirm-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      disabled={isResetting}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setForgotPasswordStep('request')} 
                  disabled={isResetting}
                  className="flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button type="submit" className="bg-[#003366] hover:bg-[#002244]" disabled={isResetting}>
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {forgotPasswordStep === 'success' && (
            <div className="py-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-slate-600 mb-6">
                Your password has been reset successfully. You can now log in with your new password.
              </p>
              <Button onClick={closeForgotPassword} className="bg-[#003366] hover:bg-[#002244]">
                Return to Login
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
