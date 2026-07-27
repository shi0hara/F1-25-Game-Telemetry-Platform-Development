import  {BrowserRouter, Routes, Route} from "react-router-dom";
import Live from "./pages/Live";

export default function App() {
  const sessionId = "F6iOgZiekNDJ47lSiWBX";
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Live sessionId={sessionId}/>} />
                <Route path="*" element={<h1>Page Not Found</h1>} />
            </Routes>
        </BrowserRouter>
    );
}
