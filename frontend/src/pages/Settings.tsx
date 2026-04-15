import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import AvatarPicker from "@/components/AvatarPicker";
import { authenticatedFetch } from "@/lib/api";

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  const [profileLoading, setProfileLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<string>("/avatars/default.png");
  const [savingAvatar, setSavingAvatar] = useState(false);

  const avatarOptions = useMemo(
    () => [
      "/avatars/default.png",
      "/avatars/avatar-1.png",
      "/avatars/avatar-2.png",
      "/avatars/avatar-3.png",
      "/avatars/avatar-4.png",
      "/avatars/avatar-5.png",
    ],
    []
  );

  useEffect(() => {
    const loadProfile = async () => {
      setProfileLoading(true);
      try {
        const res = await authenticatedFetch('/api/users/profile');
        if (!res.ok) return;
        const data = await res.json();
        const current = String(data?.avatar_url || '/avatars/default.png');
        setSelectedAvatar(current);
      } catch {
        // ignore
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  const saveAvatar = async () => {
    setSavingAvatar(true);
    try {
      const res = await authenticatedFetch('/api/users/avatar', {
        method: 'PUT',
        body: JSON.stringify({ avatar_url: selectedAvatar }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to save avatar');
        return;
      }

      const payload = await res.json().catch(() => ({}));
      const updated = String(payload?.avatar_url || selectedAvatar);
      setSelectedAvatar(updated);
      alert('Avatar updated');
    } catch {
      alert('Failed to save avatar');
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full border border-border hover:bg-slate-100 mt-1"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your personal preferences for the ATS interface.
            </p>
          </div>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription className="text-xs">
              These options are local to this browser and do not affect other users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Profile avatar</Label>
                <p className="text-xs text-muted-foreground">
                  Choose an avatar for your account. This is saved to your profile.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <img
                  src={selectedAvatar || '/avatars/default.png'}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover border border-border"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/avatars/default.png';
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  {profileLoading ? 'Loading…' : (selectedAvatar || '/avatars/default.png')}
                </div>
              </div>

              <AvatarPicker
                selectedAvatar={selectedAvatar}
                onSelect={setSelectedAvatar}
                avatars={avatarOptions}
                columns={6}
              />

              <div>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveAvatar}
                  disabled={savingAvatar || profileLoading}
                >
                  {savingAvatar ? 'Saving…' : 'Save avatar'}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Dark mode (UI only)</Label>
                <p className="text-xs text-muted-foreground">
                  Toggle a dark theme preview for the interface.
                </p>
              </div>
              <Switch
                checked={darkMode}
                onCheckedChange={setDarkMode}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Compact layout</Label>
                <p className="text-xs text-muted-foreground">
                  Use a denser layout for tables and lists.
                </p>
              </div>
              <Switch
                checked={compactMode}
                onCheckedChange={setCompactMode}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription className="text-xs">
              Basic notification preferences for this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Email updates</Label>
                <p className="text-xs text-muted-foreground">
                  Receive occasional summary emails about activity.
                </p>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
