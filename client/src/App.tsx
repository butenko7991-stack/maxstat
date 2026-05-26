import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import SchedulePage from "./pages/SchedulePage";
import ChannelsPage from "./pages/ChannelsPage";
import PurchasesPage from "./pages/PurchasesPage";
import SalesPage from "./pages/SalesPage";
import SummaryPage from "./pages/SummaryPage";
import AIAnalyticsPage from "./pages/AIAnalyticsPage";
import AdminPage from "./pages/AdminPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/channels" component={ChannelsPage} />
      <Route path="/purchases" component={PurchasesPage} />
      <Route path="/sales" component={SalesPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/summary" component={SummaryPage} />
      <Route path="/ai" component={AIAnalyticsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AppLayout>
            <Router />
          </AppLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
