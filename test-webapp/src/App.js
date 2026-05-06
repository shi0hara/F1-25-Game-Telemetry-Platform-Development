import  {BrowserRouter, Routes, Route} from "react-router-dom";
import Live from "./pages/Live";

export default function App() {
  const sessionId = "RG5DI31WQXmaZkDVxhWD";
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Live sessionId={sessionId}/>} />
                <Route path="*" element={<h1>Page Not Found</h1>} />
            </Routes>
        </BrowserRouter>
    );
}